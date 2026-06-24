using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;

namespace Unity.Services.Core.Editor
{
    /// <summary>
    /// Custom controls on top of base offering
    /// </summary>
    static class UIServiceExtensions
    {
        public static Color TitleBackground = new Color(0f, 0f, 0f, 0.2f);
        public static Color HeaderBackground = new Color(0f, 0f, 0f, 0.1f);
        public static Color PanelBackground = new Color(0.4f, 0.4f, 0.4f, 0.05f);
        public static Color FooterBackground = new Color(0f, 0f, 0f, 0.05f);
        public static Color PanelBorder = new Color(0.5f, 0.5f, 0.5f, 0.3f);

        public static Color ErrorBackground = new Color(0.4f, 0.1f, 0.1f, 1f);
        public static Color SuccessBackground = new Color(0f, 0.4f, 0.2f, 1f);
        public static Color InfoBackground = new Color(0.2f, 0.2f, 0.5f, 1f);
        public static Color WarningBackground = new Color(0.4f, 0.4f, 0.1f, 1f);
        public static Color HighlightBackground = new Color(0f, 0.3f, 0.3f, 1f);

        public static Color BlockBackground = new Color(0.5f, 0.5f, 0.5f, 0.1f);
        public static Color BlockHoverBackground = new Color(0.5f, 0.5f, 0.5f, 0.15f);
        public static Color BlockBorder = new Color(0.3f, 0.3f, 0.3f, 0.2f);

        public static UIButton Button(this UIService ui, string text, Action action)
        {
            return ui.Button()
                .SetText(text)
                .SetClickCallback(action);
        }

        public static UIButton Button(this UIService ui, string text, Func<Task> action)
        {
            return ui.Button()
                .SetText(text)
                .SetClickCallback(action);
        }

        public static UILabel Label(this UIService ui, string text)
        {
            return ui.Label()
                .SetText(text);
        }

        public static UISelectableLabel SelectableLabel(this UIService ui, string text)
        {
            return ui.SelectableLabel()
                .SetName("SelectableLabel")
                .SetText(text);
        }

        public static UILabel H1(this UIService ui, string text)
        {
            return ui.Label()
                .SetName("H1")
                .SetText(text)
                .SetFontStyle(FontStyle.Bold)
                .SetFontSize(18);
        }

        public static UILabel H2(this UIService ui, string text)
        {
            return ui.Label()
                .SetName("H2")
                .SetText(text)
                .SetFontStyle(FontStyle.Bold)
                .SetFontSize(16);
        }

        public static UILabel H3(this UIService ui, string text)
        {
            return ui.Label()
                .SetName("H3")
                .SetText(text)
                .SetFontStyle(FontStyle.Bold)
                .SetFontSize(15);
        }

        public static UILabel H4(this UIService ui, string text)
        {
            return ui.Label()
                .SetName("H4")
                .SetText(text)
                .SetFontStyle(FontStyle.Bold)
                .SetFontSize(14);
        }

        public static UILabel H5(this UIService ui, string text)
        {
            return ui.Label()
                .SetName("H5")
                .SetText(text)
                .SetFontStyle(FontStyle.Bold)
                .SetFontSize(13);
        }

        public static UIElement Separator(this UIService ui, Color? color = null)
        {
            return ui.Element()
                .SetName("Separator")
                .SetBorderTopWidth(2)
                .SetBorderTopColor(color ?? new Color(0.5f, 0.5f, 0.5f, 1f))
                .SetMargin(5, 0, 5, 0);
        }

        public static UIElement Space(this UIService ui)
        {
            return ui.Element()
                .SetName("Space")
                .SetPadding(5, 5, 5, 5);
        }

        public static UIElement Space(this UIService ui, StyleLength length)
        {
            return ui.Element()
                .SetName("Space")
                .SetPadding(length, length, length, length);
        }

        public static UIElement Flex(this UIService ui)
        {
            return ui.Element()
                .SetName("Flex")
                .SetFlexShrink(1f)
                .SetFlexGrow(1f)
                .SetPadding(5, 5, 5, 5);
        }

        public static UIElement HorizontalElement(this UIService ui)
        {
            return ui.Element()
                .SetName("HorizontalElement")
                .SetFlexDirection(FlexDirection.Row);
        }

        public static UIElement HorizontalLayout(this UIService ui)
        {
            return ui.HorizontalElement().Expand();
        }

        public static UIElement VerticalElement(this UIService ui)
        {
            return ui.Element()
                .SetName("VerticalElement")
                .SetFlexDirection(FlexDirection.Column);
        }

        public static UIElement VerticalLayout(this UIService ui)
        {
            return ui.VerticalElement().Expand();
        }

        public static UIElement Panel(this UIService ui)
        {
            return ui.Element()
                .SetName("Panel")
                .SetBackgroundColor(PanelBackground)
                .SetBorderWidth(1)
                .SetBorderColor(PanelBorder)
                .SetBorderRadius(5)
                .SetPadding(5, 10, 5, 10);
        }

        public static UIElement HorizontalPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("HorizontalPanel")
                .SetFlexDirection(FlexDirection.Row);
        }

        public static UIElement VerticalPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("VerticalPanel")
                .SetFlexDirection(FlexDirection.Column);
        }

        public static UIElement TitlePanel(this UIService ui)
        {
            return ui.VerticalElement()
                .SetName("TitlePanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetFlexShrink(0)
                .SetBackgroundColor(TitleBackground)
                .SetBorderColor(PanelBorder)
                .SetBorderWidth(1, 1, 0, 1)
                .SetPadding(5, 10, 5, 10);
        }

        public static UIElement HeaderPanel(this UIService ui)
        {
            return ui.VerticalElement()
                .SetName("HeaderPanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetFlexShrink(0)
                .SetBackgroundColor(HeaderBackground)
                .SetBorderRadius(5, 5, 0, 0)
                .SetBorderColor(PanelBorder)
                .SetBorderWidth(1, 1, 0, 1)
                .SetPadding(5, 10, 5, 10);
        }

        public static UIElement HeaderPanel(this UIService ui, IUIBinding<bool> openBinding)
        {
            var element = ui.HeaderPanel();

            var openTrigger = new Action<bool>(open =>
            {
                if (open)
                {
                    element.SetBorderRadius(5, 5, 0, 0);
                }
                else
                {
                    element.SetBorderRadius(5, 5, 5, 5);
                }
            });

            openBinding.Changed += openTrigger;
            openTrigger(openBinding.Value);
            return element;
        }

        public static UIScrollView ScrollPanel(this UIService ui, bool includeFooter = true)
        {
            var panel = ui.ScrollView()
                .SetName("ScrollPanel")
                .SetBackgroundColor(PanelBackground)
                .SetBorderColor(PanelBorder)
                .SetBorderWidth(1, 1, 1, 1)
                .SetBorderRadius(0, 0, 5, 5)
                .SetFlexShrink(1)
                .SetFlexGrow(1);

            if (includeFooter)
            {
                panel.SetBorderRadius(0, 0, 5, 5);
            }
            else
            {
                panel.SetBorderRadius(0, 0, 0, 0);
            }

            return panel;
        }

        public static UIElement ScrollContent(this UIService ui)
        {
            return ui.Element()
                .SetName("ScrollContent")
                .SetPadding(5)
                .SetHeight(new Length(100, LengthUnit.Percent));
        }

        public static UIElement ContentPanel(this UIService ui, bool includeFooter = true)
        {
            var panel = ui.VerticalElement()
                .SetName("ContentPanel")
                .SetBackgroundColor(PanelBackground)
                .SetBorderColor(PanelBorder)
                .SetBorderWidth(1, 1, 1, 1)
                .SetBorderRadius(0, 0, 5, 5)
                .SetPadding(8);

            if (includeFooter)
            {
                panel.SetBorderRadius(0, 0, 5, 5);
            }
            else
            {
                panel.SetBorderRadius(0, 0, 0, 0);
            }

            return panel;
        }

        public static UIElement FooterPanel(this UIService ui)
        {
            return ui.VerticalElement()
                .SetName("FooterPanel")
                .SetBackgroundColor(FooterBackground)
                .SetBorderRadius(0, 0, 5, 5)
                .SetBorderColor(PanelBorder)
                .SetBorderWidth(0, 1, 1, 1)
                .SetMinHeight(5)
                .SetFlexDirection(FlexDirection.Row)
                .SetFlexShrink(0)
                .SetPadding(5, 10, 5, 10);
        }

        public static UIElement ErrorPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("ErrorPanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetColor(new Color(1f, 1f, 1f))
                .SetBackgroundColor(ErrorBackground);
        }

        public static UIElement SuccessPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("SuccessPanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetColor(new Color(1f, 1f, 1f))
                .SetBackgroundColor(SuccessBackground);
        }

        public static UIElement InfoPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("InfoPanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetColor(new Color(1f, 1f, 1f))
                .SetBackgroundColor(InfoBackground);
        }

        public static UIElement WarningPanel(this UIService ui)
        {
            return ui.Panel()
                .SetName("WarningPanel")
                .SetFlexDirection(FlexDirection.Row)
                .SetColor(new Color(1f, 1f, 1f))
                .SetBackgroundColor(WarningBackground);
        }

        public static UIElement Highlight(this UIService ui)
        {
            return ui.Panel()
                .SetName("Highlight")
                .SetFlexDirection(FlexDirection.Row)
                .SetColor(new Color(1f, 1f, 1f))
                .SetBackgroundColor(HighlightBackground);
        }

        public static UIElement Block(this UIService ui)
        {
            return ui.Element()
                .SetName("Block")
                .SetHorizontal()
                .SetBorderRadius(3)
                .SetBorderWidth(1)
                .SetMargin(1)
                .SetBorderColor(BlockBorder)
                .SetPadding(2, 5, 2, 5)
                .SetCustomStyle(
                    normal: element => element.SetBackgroundColor(BlockBackground),
                    hover: element => element.SetBackgroundColor(BlockHoverBackground));
        }

        public static UIScope HorizontalScope(this UIService ui)
        {
            return ui.HorizontalElement()
                .SetName("HorizontalScope")
                .Scope();
        }

        public static UIScope VerticalScope(this UIService ui)
        {
            return ui.VerticalElement()
                .SetName("VerticalScope")
                .Scope();
        }

        public static UIScope EnabledScope(this UIService ui)
        {
            return ui.HorizontalElement()
                .SetName("EnabledScope")
                .SetEnabled()
                .Scope();
        }

        public static UIScope DisabledScope(this UIService ui)
        {
            return ui.HorizontalElement()
                .SetName("DisabledScope")
                .SetDisabled()
                .Scope();
        }

        public static UIScope EnabledScope(this UIService ui, Func<bool> enabled)
        {
            return ui.HorizontalElement()
                .SetName("EnabledScope")
                .BindEnable(ui.BindReadOnly(enabled))
                .Scope();
        }

        public static UISelectionGrid SelectionGrid(this UIEditorService ui, string[] selections)
        {
            return ui.Process(new UISelectionGrid(ui, selections)
                .SetName("SelectionGrid"));
        }

        public static UISelectionGrid<T> SelectionGrid<T>(this UIEditorService ui) where T : Enum
        {
            return ui.Process(new UISelectionGrid<T>(ui)
                .SetName($"SelectionGrid<{typeof(T).Name}>"));
        }
    }

    class UISelectionGrid<T> : UIEditorElement<VisualElement> where T : Enum
    {
        public event Action<T> SelectionChange;
        public T Current { get; private set; }

        internal UISelectionGrid(UIEditorService ui) : base(ui)
        {
            var selections = (T[])Enum.GetValues(typeof(T));

            using (Scope())
            {
                for (var i = 0; i != selections.Length; ++i)
                {
                    var selection = selections[i];
                    var selectionString = selection.ToString();
                    var button = UI.Button()
                        .SetName(selectionString)
                        .BindEnable(UI.BindReadOnly(() => !Current.Equals(selection)))
                        .SetText(selectionString)
                        .SetClickCallback(() => SetSelection(selection));
                }
            }
        }

        public UISelectionGrid<T> RegisterSelectionCallback(Action<T> action)
        {
            SelectionChange += action;
            return this;
        }

        protected UISelectionGrid<T> SetSelection(T selection)
        {
            if (!Current.Equals(selection))
            {
                Current = selection;
                SelectionChange?.Invoke(Current);
            }

            return this;
        }

        public UISelectionGrid<T> BindValue(IUIBinding<T> binding)
        {
            return BindingUtils.Bind(this, (value) => SetSelection(value), (value) => SelectionChange += value, binding);
        }
    }

    class UISelectionGrid : UIEditorElement<VisualElement>
    {
        public event Action<int> ActiveChange;
        public string[] Selections { get; }
        public int Current { get; private set; }

        internal UISelectionGrid(UIEditorService ui, string[] selections) : base(ui)
        {
            Selections = selections;

            using (Scope())
            {
                for (var i = 0; i != Selections.Length; ++i)
                {
                    var buttonIndex = i;
                    var button = UI.Button()
                        .SetName(Selections[i])
                        .BindEnable(UI.BindReadOnly(() => Current != i))
                        .SetText(Selections[i])
                        .SetClickCallback(() => SetIndex(buttonIndex));
                }
            }
        }

        public UISelectionGrid RegisterSelectionCallback(Action<int> action)
        {
            ActiveChange += action;
            return this;
        }

        protected virtual UISelectionGrid SetIndex(int index)
        {
            Current = index;
            ActiveChange?.Invoke(Current);
            return this;
        }

        public UISelectionGrid BindValue(IUIBinding<int> binding)
        {
            return BindingUtils.Bind(this, (value) => SetIndex(value), binding);
        }
    }
}
