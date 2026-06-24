using System;
using UnityEngine;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditorInternal;

namespace UnityEditor.U2D.Sprites
{
    internal class SpriteSlicePostprocessor : AssetPostprocessor
    {
        public override int GetPostprocessOrder()
        {
            return -1;
        }

        public override uint GetVersion()
        {
            return 2;
        }

        static bool IsAssetCompatible(Type importerType)
        {
            if (importerType == null)
                return false;

            return SpriteDataProviderFactories.IsTypeSupportedByFactories(importerType)
                || typeof(ISpriteEditorDataProvider).IsAssignableFrom(importerType);
        }

        static ISpriteEditorDataProvider GetSpriteEditorDataProvider(string assetPath)
        {
            var dataProviderFactories = new SpriteDataProviderFactories();
            dataProviderFactories.Init();
            return dataProviderFactories.GetSpriteEditorDataProviderFromObject(AssetImporter.GetAtPath(assetPath));
        }

        private static void PostProcessAsset(string assetPath)
        {
            if (String.IsNullOrEmpty(assetPath))
                return;

            var sprites = new List<Sprite>();
            var assets = AssetDatabase.LoadAllAssetsAtPath(assetPath);
            foreach (var asset in assets)
            {
                if (asset is Sprite sprite)
                {
                    sprites.Add(sprite);
                }
            }
            if (sprites.Count == 0)
                return;

            var dataProvider = GetSpriteEditorDataProvider(assetPath);
            if (dataProvider == null)
                return;

            dataProvider.InitSpriteEditorDataProvider();
            var textureDataProvider = dataProvider.GetDataProvider<ITextureDataProvider>();
            if (textureDataProvider == null)
                return;

            var texture = textureDataProvider.GetReadableTexture2D();
            if (texture == null)
                return;

            var customDataProvider = dataProvider.GetDataProvider<ISpriteCustomDataProvider>();
            if (customDataProvider == null)
                return;

            var capabilityProvider = dataProvider.GetDataProvider<ISpriteFrameEditCapability>();
            if (capabilityProvider == null ||
                !capabilityProvider.GetEditCapability().HasCapability(EEditCapability.SliceOnImport))
                return;

            customDataProvider.GetData(SpriteEditorMenuSetting.kSliceOnImportKey, out var sliceOnImportData);
            if (!bool.TryParse(sliceOnImportData, out var sliceOnImport) || !sliceOnImport)
                return;

            customDataProvider.GetData(SpriteEditorMenuSetting.kSliceSettingsKey, out var sliceSettingsData);
            if (string.IsNullOrEmpty(sliceSettingsData))
                return;

            var sliceSettings = JsonUtility.FromJson<SpriteEditorMenuSetting>(sliceSettingsData);

            var rectsCache = ScriptableObject.CreateInstance<SpriteRectModel>();
            var spriteList = new List<SpriteRect>(dataProvider.GetSpriteRects());
            var originalRects = spriteList.ToArray();
            if (sliceSettings.autoSlicingMethod != (int) SpriteFrameModule.AutoSlicingMethod.DeleteAll)
            {
                rectsCache.SetSpriteRects(spriteList);
            }

            List<Rect> frames = null;
            switch (sliceSettings.slicingType)
            {
                case SpriteEditorMenuSetting.SlicingType.Automatic:
                    {
                        frames = new List<Rect>(InternalSpriteUtility.GenerateAutomaticSpriteRectangles(texture, 4, 0));
                        if (frames.Count == 0)
                            frames.Add(new Rect(0, 0, texture.width, texture.height));
                    }
                    break;
                case SpriteEditorMenuSetting.SlicingType.IsometricGrid:
                    {
                        frames = new List<Rect>(IsometricSlicingUtility.GetIsometricRects(texture
                            , sliceSettings.gridSpriteSize
                            , sliceSettings.gridSpriteOffset
                            , sliceSettings.isAlternate
                            , sliceSettings.keepEmptyRects));
                    }
                    break;
                case SpriteEditorMenuSetting.SlicingType.GridByCellCount:
                    {
                        SpriteEditorUtility.DetermineGridCellSizeWithCellCount(texture.width,
                            texture.height,
                            sliceSettings.gridSpriteOffset,
                            sliceSettings.gridSpritePadding,
                            sliceSettings.gridCellCount,
                            out var cellSize);
                        frames = new List<Rect>(InternalSpriteUtility.GenerateGridSpriteRectangles(texture
                            , sliceSettings.gridSpriteOffset
                            , cellSize
                            , sliceSettings.gridSpritePadding
                            , sliceSettings.keepEmptyRects));
                    }
                    break;
                case SpriteEditorMenuSetting.SlicingType.GridByCellSize:
                    {
                        frames = new List<Rect>(InternalSpriteUtility.GenerateGridSpriteRectangles(texture
                            , sliceSettings.gridSpriteOffset
                            , sliceSettings.gridSpriteSize
                            , sliceSettings.gridSpritePadding
                            , sliceSettings.keepEmptyRects));
                    }
                    break;
            }
            if (frames == null)
                return;

            var stringBuilder = new StringBuilder(Path.GetFileNameWithoutExtension(assetPath) + "_");
            Func<int, string> nameGenerate = startIndex =>
            {
                var originalLength = stringBuilder.Length;
                stringBuilder.Append(startIndex);
                var name = stringBuilder.ToString();
                stringBuilder.Length = originalLength;
                return name;
            };
            var outlines = new List<Vector2[]>(4)
            {
                new[] { new Vector2(0.0f, -sliceSettings.gridSpriteSize.y / 2)
                    , new Vector2(sliceSettings.gridSpriteSize.x / 2, 0.0f)
                    , new Vector2(0.0f, sliceSettings.gridSpriteSize.y / 2)
                    , new Vector2(-sliceSettings.gridSpriteSize.x / 2, 0.0f)}
            };

            var index = 0;
            var originalCount = rectsCache.spriteRects.Count;
            var spriteRects = rectsCache.GetSpriteRects();
            foreach (var frame in frames)
            {
                var pivot = sliceSettings.pivot;
                if (sliceSettings.pivotUnitMode == SpriteFrameModuleBase.PivotUnitMode.Pixels &&
                    sliceSettings.slicingType == SpriteEditorMenuSetting.SlicingType.Automatic)
                {
                    pivot = sliceSettings.pivotPixels / frame.size;
                }
                var spriteIndex = rectsCache.AddSprite(frame, sliceSettings.spriteAlignment, pivot, (SpriteFrameModule.AutoSlicingMethod) sliceSettings.autoSlicingMethod, originalCount, ref index, nameGenerate);
                if (sliceSettings.slicingType == SpriteEditorMenuSetting.SlicingType.IsometricGrid)
                {
                    var outlineRect = new OutlineSpriteRect(spriteRects[spriteIndex]);
                    outlineRect.outlines = outlines;
                    spriteRects[spriteIndex] = outlineRect;
                }
            }

            if (sliceSettings.autoSlicingMethod == (int) SpriteFrameModule.AutoSlicingMethod.DeleteAll)
                rectsCache.ClearUnusedFileID();

            // Remove invalid SpriteRects
            var textureRect = new Rect(0, 0, texture.width, texture.height);
            for (var i = 0; i < spriteRects.Count;)
            {
                var rect = spriteRects[i].rect;
                if (textureRect.xMin <= rect.min.x && textureRect.yMin <= rect.min.y &&
                    rect.max.x <= textureRect.xMax && rect.max.y <= textureRect.yMax)
                {
                    i++;
                }
                else
                {
                    spriteRects.RemoveAt(i);
                }
            }
            var spriteRectArray = spriteRects.ToArray();
            if (spriteRectArray.Length == originalRects.Length)
            {
                var needImport = false;
                foreach (var rect in spriteRectArray)
                {
                    var equal = false;
                    foreach (var originalRect in originalRects)
                    {
                        if (originalRect.rect != rect.rect)
                            continue;
                        equal = true;
                        break;
                    }
                    if (!equal)
                        needImport = true;
                }
                if (!needImport)
                    return;
            }
            dataProvider.SetSpriteRects(spriteRectArray);

            var nameFileIdDataProvider = dataProvider.GetDataProvider<ISpriteNameFileIdDataProvider>();
            var spriteNames = rectsCache.spriteNames;
            var spriteFileIds = rectsCache.spriteFileIds;
            if (spriteNames != null && spriteFileIds != null)
            {
                var pairList = new List<SpriteNameFileIdPair>(spriteNames.Count);
                for (var i = 0; i < spriteNames.Count; ++i)
                {
                    pairList.Add(new SpriteNameFileIdPair(spriteNames[i], spriteFileIds[i]));
                }
                nameFileIdDataProvider.SetNameFileIdPairs(pairList.ToArray());
            }
            dataProvider.Apply();

            AssetDatabase.ForceReserializeAssets(new [] {assetPath}, ForceReserializeAssetsOptions.ReserializeMetadata);
        }

        //EAD-2003 : change from OnPostProcessSprite to OnPostprocessAllAssets
        //D2D-7889 : future change from 2 imports to a single import per asset
        //
        //This post processor is necessary for the AutoSlice sprite feature.
        //Considering a texture that changed (e.g adding new sprites to it), the process is as follow :
        // - import the texture asset with AutoSlice On in the texture importer setting
        // - OnPostprocessAllAssets detects an importer texture supported by the sprite system
        // - new sprite slices are computed and saved into the spritesheet data in the metafile
        // - a new import is started due to the metafile edition
        // - sprite sub-assets are created by the texture importer from the spritesheet data in the metafile
        // - OnPostprocessAllAssets detects a texture but do not detect any new slices, end of import
        //
        //Note that the spritesheet data in the metafile is also used by the SpriteEditor initialization.
        private static void OnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets, string[] movedAssets, string[] movedFromAssetPaths)
        {
            var importerTypes = AssetDatabase.GetImporterTypes(importedAssets);

            var needRefresh = false;
            for (int i = 0; i < importedAssets.Length; i++)
            {
                string assetPath = importedAssets[i];
                if (!IsAssetCompatible(importerTypes[i]))
                    continue;

                var dataProvider = GetSpriteEditorDataProvider(assetPath);
                if (dataProvider == null)
                    continue;

                dataProvider.InitSpriteEditorDataProvider();
                var customDataProvider = dataProvider.GetDataProvider<ISpriteCustomDataProvider>();
                if (customDataProvider == null)
                    continue;

                var capabilityProvider = dataProvider.GetDataProvider<ISpriteFrameEditCapability>();
                if (capabilityProvider == null ||
                    !capabilityProvider.GetEditCapability().HasCapability(EEditCapability.SliceOnImport))
                    continue;

                customDataProvider.GetData(SpriteEditorMenuSetting.kSliceOnImportKey, out var sliceOnImportData);
                if (!bool.TryParse(sliceOnImportData, out var sliceOnImport) || !sliceOnImport)
                    continue;

                customDataProvider.GetData(SpriteEditorMenuSetting.kSliceSettingsKey, out var sliceSettingsData);
                if (string.IsNullOrEmpty(sliceSettingsData))
                    continue;

                PostProcessAsset(assetPath);
                needRefresh = true;
            }

            if (needRefresh)
                AssetDatabase.Refresh();
        }
    }
}
