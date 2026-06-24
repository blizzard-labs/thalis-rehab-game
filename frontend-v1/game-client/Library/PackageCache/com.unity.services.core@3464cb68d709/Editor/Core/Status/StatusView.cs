using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Unity.Services.Core.Editor
{
    class StatusView
    {
        public enum AccessTokenType { Decoded, Raw }

        const string GlobalServices = "Global";
        const string UninitializedLabel = "Uninitialized";

        UIService UI { get; }
        public IUnityServices Services { get; private set; }

        IStatusService Status { get; set; }

        UIDropdownField Dropdown { get; set; }

        readonly List<string> ServiceKeys = new List<string>() { GlobalServices };

        public AccessTokenType PlayerAccessTokenView { get; set; }
        public AccessTokenType ServerAccessTokenView { get; set; }

        public StatusView(UIService ui)
        {
            UI = ui;
        }

        public void Update()
        {
            if (Application.isPlaying && Services == null)
            {
                SelectGlobal();
            }

            if (UnityServices.Services.Count != ServiceKeys.Count - 1)
            {
                ServiceKeys.Clear();
                ServiceKeys.Add(GlobalServices);

                foreach (var key in UnityServices.Services.Keys)
                {
                    ServiceKeys.Add(key);
                }
            }
        }

        public void SetServices(IUnityServices services)
        {
            Reset();
            Services = services;

            if (Services != null)
            {
                if (Services.State == ServicesInitializationState.Initialized)
                {
                    OnInitialized();
                }
                else
                {
                    Services.Initialized += OnInitialized;
                }
            }
        }

        public void Reset()
        {
            if (Services != null)
            {
                Services.Initialized -= OnInitialized;
            }

            Status = null;
            Services = null;
        }

        void SelectGlobal()
        {
            Dropdown.SetValue(GlobalServices);
            SetServices(UnityServices.Instance);
        }

        void OnSelected(string value)
        {
            SetServices(string.IsNullOrEmpty(value) ?
                null : value == GlobalServices
                ? UnityServices.Instance
                : UnityServices.Services.ContainsKey(value) ? UnityServices.Services[value] : null);
        }

        void OnInitialized()
        {
            Status = Services.GetService<IStatusService>();
        }

        public void CreateGUI()
        {
            UI.Label()
                .SetName("StatusInfo")
                .SetText("Status will be displayed here during play mode.")
                .SetFontStyleItalic()
                .SetPadding(5)
                .BindDisplay(UI.BindReadOnly(() => !Application.isPlaying));

            using (UI.VerticalElement()
                   .SetName("StatusContainer")
                   .BindDisplay(UI.BindReadOnly(() => Application.isPlaying))
                   .Scope())
            {
                using (UI.TitlePanel()
                       .SetName("ServicesSelection")
                       .BindDisplay(UI.BindReadOnly(() => ServiceKeys.Count > 1))
                       .Scope())
                {
                    Dropdown = UI.DropdownField()
                        .SetName("ServicesDropdown")
                        .SetWidth(150)
                        .SetChoices(ServiceKeys)
                        .RegisterValueChanged((value) => OnSelected(value.newValue));
                }
                using (UI.ScrollView()
                       .SetPadding(5)
                       .Scope())
                {
                    using (UI.ScrollView().Scope())
                    using (UI.ScrollContent().Scope())
                    {
                        UI.Label("Services information will be displayed here while in play mode.")
                            .BindDisplay(UI.BindReadOnly(() => !Application.isPlaying));

                        using (UI.Element()
                               .BindDisplay(UI.BindReadOnly(() => Application.isPlaying))
                               .Scope())
                        {
                            CreateValuesGUI();
                        }
                    }
                }
            }

            SelectGlobal();
        }

        void CreateValuesGUI()
        {
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Initialization State");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.GetState() ?? UninitializedLabel));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Project Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.CloudProjectIdProvider?.GetCloudProjectId() ?? string.Empty));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Environment");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.EnvironmentProvider?.Current));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Environment Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.EnvironmentIdProvider?.EnvironmentId));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Analytics User Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.AnalyticsUserIdProvider?.GetAnalyticsUserId()));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Installation Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.InstallationIdProvider?.GetOrCreateIdentifier()));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Player Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.PlayerIdProvider?.PlayerId));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("Player Name");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.PlayerNameProvider?.PlayerName));
                }
            }
            using (UI.HorizontalScope())
            {
                using (UI.Block().SetWidth(150).Scope())
                {
                    UI.Label("External User Id");
                }
                using (UI.Block().Expand().Scope())
                {
                    UI.SelectableLabel()
                        .BindValue(UI.BindReadOnly(() => Status?.ExternalUserIdProvider?.UserId));
                }
            }

            CreatePlayerAccessTokenGUI();
            CreateServerAccessTokenGUI();
        }

        void CreatePlayerAccessTokenGUI()
        {
            using (UI.Element()
                   .BindDisplay(UI.BindReadOnly(() => Status?.PlayerAccessToken != null))
                   .SetName("PlayerAccessTokenContainer")
                   .SetPaddingTop(5)
                   .Scope())
            {
                using (UI.HeaderPanel().Scope())
                {
                    UI.H5($"Player Access Token");
                    UI.Flex();
                    UI.EnumField()
                        .Init(PlayerAccessTokenView)
                        .BindValue(UI.BindTarget(
                            () => PlayerAccessTokenView as Enum,
                            (value) => PlayerAccessTokenView = (AccessTokenType)value))
                        .SetWidth(100);
                }
                using (UI.ContentPanel().Scope())
                {
                    using (UI.Block().Scope())
                    {
                        UI.SelectableLabel()
                            .BindValue(UI.BindReadOnly(() => Status?.PlayerAccessToken))
                            .BindDisplay(UI.BindReadOnly(() => PlayerAccessTokenView == AccessTokenType.Raw))
                            .SetMultiline(true)
                            .SetWhitespace(WhiteSpace.Normal);

                        UI.SelectableLabel()
                            .BindValue(UI.BindReadOnly(() => Status?.PlayerAccessTokenDecoded))
                            .BindDisplay(UI.BindReadOnly(() => PlayerAccessTokenView == AccessTokenType.Decoded))
                            .SetMultiline(true)
                            .SetWhitespace(WhiteSpace.Normal);
                    }
                }
            }
        }

        void CreateServerAccessTokenGUI()
        {
            using (UI.Element()
                   .BindDisplay(UI.BindReadOnly(() => Status?.ServerAccessToken != null))
                   .SetName("ServerAccessTokenContainer")
                   .SetPaddingTop(5)
                   .Scope())
            {
                using (UI.HeaderPanel().Scope())
                {
                    UI.H5($"Server Access Token");
                    UI.Flex();
                    UI.EnumField()
                        .Init(ServerAccessTokenView)
                        .BindValue(UI.BindTarget(
                            () => ServerAccessTokenView as Enum,
                            (value) => ServerAccessTokenView = (AccessTokenType)value))
                        .SetWidth(100);
                }
                using (UI.ContentPanel().Scope())
                {
                    using (UI.Block().Scope())
                    {
                        UI.SelectableLabel()
                            .BindValue(UI.BindReadOnly(() => Status?.ServerAccessToken))
                            .BindDisplay(UI.BindReadOnly(() => ServerAccessTokenView == AccessTokenType.Raw))
                            .SetMultiline(true)
                            .SetWhitespace(WhiteSpace.Normal);

                        UI.SelectableLabel()
                            .BindValue(UI.BindReadOnly(() => Status?.ServerAccessTokenDecoded))
                            .BindDisplay(UI.BindReadOnly(() => ServerAccessTokenView == AccessTokenType.Decoded))
                            .SetMultiline(true)
                            .SetWhitespace(WhiteSpace.Normal);
                    }
                }
            }
        }
    }
}
