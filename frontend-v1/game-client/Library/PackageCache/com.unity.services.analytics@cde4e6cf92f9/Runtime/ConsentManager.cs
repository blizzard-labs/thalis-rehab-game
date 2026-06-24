using System;
#if ENABLE_UNITY_CONSENT
using UnityEngine.UnityConsent;
#endif

namespace Unity.Services.Analytics
{
    internal interface IConsentManager
    {
        bool UsingOriginalFlow { get; }
        bool UsingDataFrameworkFlow { get; }
        bool DataFrameworkConsentGranted { get; }

        event Action ConsentGranted;
        event Action ConsentRevoked;

        void LockInOriginalFlow();
        void TearDown();
    }

    internal class ConsentManager : IConsentManager
    {
        public bool UsingOriginalFlow { get; private set; }
        public bool UsingDataFrameworkFlow { get; private set; }
        public bool DataFrameworkConsentGranted { get; private set; }

#pragma warning disable CS0067
        public event Action ConsentGranted;
        public event Action ConsentRevoked;
#pragma warning restore CS0067

        public void LockInOriginalFlow()
        {
            UsingOriginalFlow = true;
        }

#if ENABLE_UNITY_CONSENT
        internal void Initialize()
        {
            EndUserConsent.consentStateChanged += DataFrameworkConsentChanged;

            ConsentState consentState = EndUserConsent.GetConsentState();
            if (consentState.AnalyticsIntent != ConsentStatus.Unspecified)
            {
                DataFrameworkConsentChanged(consentState);
            }
            // else: you may still choose to use the old system, or lock into the new one
            // by setting consent explicity after initialisation.
        }

        void DataFrameworkConsentChanged(ConsentState consentState)
        {
            if (UsingOriginalFlow)
            {
                throw new InvalidOperationException(
                    "The Analytics SDK has already been activated using the StartDataCollection method. " +
                    "In order to use the Developer Data framework, you must remove references " +
                    "to Start/StopDataCollection and only use the EndUserConsent.SetConsentState(...) method.");
            }
            else
            {
                UsingDataFrameworkFlow = true;
                switch (consentState.AnalyticsIntent)
                {
                    case ConsentStatus.Granted:
                        DataFrameworkConsentGranted = true;
                        ConsentGranted?.Invoke();
                        break;
                    case ConsentStatus.Denied:
                        DataFrameworkConsentGranted = false;
                        ConsentRevoked?.Invoke();
                        break;
                    case ConsentStatus.Unspecified:
                    default:
                        // This could happen at runtime if the developer clears consent state,
                        // rather than granting or denying. If consent was previously denied, then
                        // we are already off and there is nothing to do. If consent was previously
                        // granted, then revoke it.
                        if (DataFrameworkConsentGranted)
                        {
                            DataFrameworkConsentGranted = false;
                            ConsentRevoked?.Invoke();
                        }
                        break;
                }
            }
        }

        public void TearDown()
        {
            EndUserConsent.consentStateChanged -= DataFrameworkConsentChanged;
        }

#else
        internal void Initialize()
        {
            LockInOriginalFlow();
        }

        public void TearDown()
        {
        }

#endif
    }
}
