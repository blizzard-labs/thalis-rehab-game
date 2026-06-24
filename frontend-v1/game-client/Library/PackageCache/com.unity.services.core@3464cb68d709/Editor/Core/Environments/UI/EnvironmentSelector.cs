using System;
using System.Linq;
using System.Threading.Tasks;
using Unity.Services.Core.Editor.Shared.EditorUtils;
using Unity.Services.Core.Editor.Shared.UI;
using Unity.Services.Core.Environments.Client.Http;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Unity.Services.Core.Editor.Environments.UI
{
    class EnvironmentSelector : VisualElement
    {
        const string k_UxmlPath = "Packages/com.unity.services.core/Editor/Core/Environments/UI/Assets/EnvironmentSelectorUI.uxml";
        const string k_UxmlPathNoConnection = "Packages/com.unity.services.core/Editor/Core/UiHelpers/UXML/Offline.uxml";
#if UNITY_2021_3_OR_NEWER
        const string k_UxmlPathEnvironmentDropdown = "Packages/com.unity.services.core/Editor/Core/Environments/UI/Assets/EnvironmentDropdown.uxml";
#endif

        ModelBinding<IEnvironmentService> m_EnvironmentBindings;
        readonly IEnvironmentService m_EnvironmentService;
        readonly IEnvironmentDashboardUrlResolver m_DashboardUrlResolver;

        TemplateContainer m_RegularUxmlContainer;
        TemplateContainer m_NoConnectionUxmlContainer;

        VisualElement m_EnvironmentContainerDropdownSection;
        VisualElement m_EnvironmentContainerFetching;
        VisualElement m_EnvironmentContainerWarning;


        Button m_RefreshEnvironmentButton;
        Button m_RetryConnectionButton;

#if UNITY_2021_3_OR_NEWER
        DropdownField m_EnvironmentDropdownControl;
#else
        PopupField<string> m_EnvironmentDropdownControl;
        VisualElement m_DropdownControlContainer;
#endif

        public EnvironmentSelector(IEnvironmentService environmentService, IEnvironmentDashboardUrlResolver dashboardUrlResolver = null)
        {
            m_EnvironmentService = environmentService;
            m_DashboardUrlResolver = dashboardUrlResolver ?? new EnvironmentDashboardUrlResolver();
            SetupRegularUxml();
            SetupNoConnectionUxml();
            Sync.SafeAsync(RefreshEnvironmentsAsync);
            environmentService.PropertyChanged += (_, args) =>
            {
                switch (args.PropertyName)
                {
                    case nameof(IEnvironmentService.ActiveEnvironmentId):
                        OnEnvironmentsRefreshed(environmentService);
                        break;
                }
            };
        }

        TemplateContainer AddUxmlToVisualElement(VisualElement containerElement, string uxmlPath)
        {
            var uxmlAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(uxmlPath);
            if (uxmlAsset == null)
            {
                throw new MissingReferenceException("Could not find a uxml asset to load.");
            }

            var asset = uxmlAsset.Instantiate();
            containerElement.Add(asset);
            return asset;
        }

        void SetupRegularUxml()
        {
            m_RegularUxmlContainer = AddUxmlToVisualElement(this, k_UxmlPath);
            SetupEnvironmentDropdown(m_RegularUxmlContainer);
            m_RegularUxmlContainer.Q("Release Pointers Section").style.display = DisplayStyle.None;
            SetupManageEnvironments(m_RegularUxmlContainer);
            SetupEnvironmentWarning(m_RegularUxmlContainer);
            BindEvents();
        }

        void SetupNoConnectionUxml()
        {
            m_NoConnectionUxmlContainer = AddUxmlToVisualElement(this, k_UxmlPathNoConnection);
            m_NoConnectionUxmlContainer.style.display = DisplayStyle.None;
            SetupRetryConnectionButton(m_NoConnectionUxmlContainer, UxmlNames.EnvironmentRetryConnectionButton);
        }

        async Task RefreshEnvironmentsAsync()
        {
            try
            {
                await m_EnvironmentService.RefreshEnvironmentsAsync();
                m_RegularUxmlContainer.style.display = DisplayStyle.Flex;
                m_NoConnectionUxmlContainer.style.display = DisplayStyle.None;
            }
            catch (Exception e)
                when (e is RequestFailedException || e is HttpException)
            {
                m_RegularUxmlContainer.style.display = DisplayStyle.None;
                m_NoConnectionUxmlContainer.style.display = DisplayStyle.Flex;
            }
        }

        void BindEvents()
        {
            m_EnvironmentBindings = new ModelBinding<IEnvironmentService>(this) { Source = m_EnvironmentService };

            m_EnvironmentBindings.BindProperty(nameof(IEnvironmentService.Environments), OnEnvironmentsRefreshed);
            m_EnvironmentBindings.BindProperty(nameof(IEnvironmentService.ActiveEnvironmentId), service =>
            {
                OnEnvironmentChanged(service.ActiveEnvironmentInfo());
            });
            m_EnvironmentDropdownControl.RegisterValueChangedCallback(OnDropdownEnvironmentChanged);

        }

        void OnEnvironmentsRefreshed(IEnvironmentService service)
        {
            if (m_EnvironmentService.Environments == null)
            {
                SetVisibleEnvironmentContainer(m_EnvironmentContainerFetching);
            }
            else if (m_EnvironmentDropdownControl != null)
            {
                var choices = m_EnvironmentService.Environments.Select(env => env.Name).ToList();

                // Unity Editor 2021.1 has `choices` set as internal
#if UNITY_2021_1_OR_NEWER && !UNITY_2021_2_OR_NEWER
                    m_EnvironmentDropdownControl
                        .GetType()
                        .InvokeMember(
                            "choices",
                            BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.SetProperty,
                            null,
                            m_EnvironmentDropdownControl,
                            new object[] { choices });
#else
                m_EnvironmentDropdownControl.choices = choices;
#endif

                var currentEnvInfo = m_EnvironmentService.ActiveEnvironmentInfo();
                if (currentEnvInfo != null)
                {
                    m_EnvironmentDropdownControl.SetValueWithoutNotify(currentEnvInfo.Value.Name);
                }
                else
                {
                    m_EnvironmentDropdownControl.SetValueWithoutNotify(string.Empty);
                }

                SetVisibleEnvironmentContainer(m_EnvironmentContainerDropdownSection);
            }
            else
            {
                throw new Exception("Dropdown field of the Environment Selector has not been set.");
            }


            OnEnvironmentChanged(m_EnvironmentService.ActiveEnvironmentInfo());
        }


        void OnDropdownEnvironmentChanged(ChangeEvent<string> changeEvent)
        {
            var info = m_EnvironmentService.EnvironmentInfoFromName(changeEvent.newValue);
            if (info != null)
            {
                m_EnvironmentService.SetActiveEnvironment(info.Value);
            }
        }


        void SetupRetryConnectionButton(VisualElement containerElement, string buttonName)
        {
            m_RetryConnectionButton = containerElement.Q<Button>(buttonName);

            if (m_RetryConnectionButton == null)
            {
                return;
            }

            m_RetryConnectionButton.clicked += () =>
            {
                Sync.SafeAsync(RefreshEnvironmentsAsync);
            };
        }

        void SetupRefreshEnvironmentListButton(Button button)
        {
            if (button == null)
            {
                return;
            }

            m_RefreshEnvironmentButton = button;

            m_RefreshEnvironmentButton.clicked += () =>
            {
                m_RefreshEnvironmentButton.AddToClassList(UxmlClasses.UnityDisabled);
                Sync.SafeAsync(RefreshEnvironmentsAsync, OnDoneRefreshingEnvironments);
            };
        }


        void OnDoneRefreshingEnvironments(Task refreshTask)
        {
            m_RefreshEnvironmentButton?.RemoveFromClassList(UxmlClasses.UnityDisabled);
        }

        void SetupEnvironmentDropdown(VisualElement containerElement)
        {
            m_EnvironmentContainerDropdownSection = containerElement.Q(UxmlNames.EnvironmentContainerDropdownSection);
            m_EnvironmentContainerFetching = containerElement.Q(UxmlNames.EnvironmentContainerFetching);

            m_EnvironmentContainerDropdownSection.style.display = DisplayStyle.None;

#if UNITY_2021_3_OR_NEWER
            var uxmlAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(k_UxmlPathEnvironmentDropdown);
            if (uxmlAsset != null)
            {
                uxmlAsset.CloneTree(m_EnvironmentContainerDropdownSection);
                m_EnvironmentDropdownControl = this.Q<DropdownField>("EnvironmentDropdownControl");
                var refreshEnvButton = this.Q<Button>(UxmlNames.EnvironmentButtonRefreshEnvList);
                SetupRefreshEnvironmentListButton(refreshEnvButton);
            }
            else
            {
                throw new MissingReferenceException("Could not find a uxml asset to load.");
            }
#else
            m_DropdownControlContainer = new VisualElement { name = UxmlNames.ContainerDropdownControl };
            m_DropdownControlContainer.AddToClassList(UxmlClasses.DropdownControlContainer);

            m_EnvironmentDropdownControl = new PopupField<string>
            {
                name = UxmlNames.DropdownControl,
                label = UxmlLabels.EditorEnvironment
            };
            m_EnvironmentDropdownControl.AddToClassList(UxmlClasses.NoMargin);
            m_EnvironmentDropdownControl.AddToClassList(UxmlClasses.DropdownControl);
            m_DropdownControlContainer.Add(m_EnvironmentDropdownControl);

            var newButton = new Button
            {
                name = UxmlNames.ButtonRefreshEnvList,
                text = UxmlLabels.Refresh
            };
            newButton.AddToClassList(UxmlClasses.DropdownRefreshButton);
            m_DropdownControlContainer.Add(newButton);
            SetupRefreshEnvironmentListButton(newButton);

            m_EnvironmentContainerDropdownSection.Add(m_DropdownControlContainer);
#endif
        }


        void SetupManageEnvironments(VisualElement containerElement)
        {
            var containerManageEnvironments = containerElement.Q(UxmlNames.EnvironmentContainerManageEnvironments);
#if ENABLE_EDITOR_GAME_SERVICES
            var clickable = new Clickable(() =>
            {
                Application.OpenURL(m_DashboardUrlResolver.ManageEnvironments());
            });
            containerManageEnvironments.AddManipulator(clickable);
#else
            containerManageEnvironments.style.display = DisplayStyle.None;
#endif
        }


        void SetupEnvironmentWarning(VisualElement containerElement)
        {
            m_EnvironmentContainerWarning = containerElement.Q(UxmlNames.EnvironmentContainerWarning);
            m_EnvironmentContainerWarning.style.display = DisplayStyle.None;
        }


        void OnEnvironmentChanged(EnvironmentInfo? environmentInfo)
        {
            m_EnvironmentContainerWarning.style.display = environmentInfo?.IsDefault ?? false
                ? DisplayStyle.Flex
                : DisplayStyle.None;
        }


        void SetVisibleEnvironmentContainer(VisualElement containerElement)
        {
            m_EnvironmentContainerDropdownSection.style.display =
                containerElement == m_EnvironmentContainerDropdownSection
                    ? DisplayStyle.Flex
                    : DisplayStyle.None;
            m_EnvironmentContainerFetching.style.display =
                containerElement == m_EnvironmentContainerFetching
                    ? DisplayStyle.Flex
                    : DisplayStyle.None;
        }


        static class UxmlNames
        {
            public const string EnvironmentContainerDropdownSection = "Environment Dropdown Section";
            public const string EnvironmentContainerFetching = "Fetching Environments Section";
            public const string EnvironmentContainerManageEnvironments = "Manage Environments Container";
            public const string EnvironmentContainerWarning = "Default Environment Section";
            public const string EnvironmentButtonRefreshEnvList = "RefreshEnvironmentDropdownButton";
            public const string EnvironmentContainerDropdownControl = "EnvironmentDropdownContainer";
            public const string EnvironmentDropdownControl = "EnvironmentDropdownControl";
            public const string EnvironmentRetryConnectionButton = "EnvironmentRefreshBtn";

            public const string UseLiveReleasesToggle = "UseLiveReleasesToggle";
            public const string ReleasePointerContainerDropdownSection = "Release Pointer Dropdown Section";
            public const string ReleasePointerContainerFetching = "Fetching Release Pointers Section";
            public const string ReleasePointerContainerManageEnvironments = "Manage Release Pointers Container";
            public const string ReleasePointerContainerWarning = "Default Release Pointer Section";
            public const string ReleasePointerTargetSection = "Release Pointer Target Section";
            public const string ReleasePointerTargetInfo = "ReleasePointerTargetInfo";
            public const string ReleasePointerUnassignedSection = "Release Pointer Unassigned Section";
            public const string ReleasePointerButtonRefreshPointerList = "RefreshReleasePointerDropdownButton";
            public const string ReleasePointerContainerDropdownControl = "ReleasePointerDropdownContainer";
            public const string ReleasePointerDropdownControl = "ReleasePointerDropdownControl";
            public const string ReleasePointerRetryConnectionButton = "ReleasePointerRefreshBtn";
        }

        static class UxmlClasses
        {
            public const string DropdownControlContainer = "dropdown-control-container";
            public const string DropdownRefreshButton = "dropdown-refresh-button";
            public const string NoMargin = "no-margin";
            public const string DropdownControl = "dropdown-control";
            public const string UnityDisabled = "unity-disabled";
        }

        static class UxmlLabels
        {
            public const string Refresh = "Refresh";
            public const string EditorEnvironment = "Environment";
        }
    }
}
