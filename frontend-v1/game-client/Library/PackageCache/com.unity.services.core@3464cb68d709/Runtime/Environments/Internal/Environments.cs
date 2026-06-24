namespace Unity.Services.Core.Environments.Internal
{
    /// <inheritdoc />
    class Environments : IEnvironments
    {
        string m_Current;

        public string Current
        {
            get => m_Current;
            internal set
            {
                m_Current = value;
            }
        }
    }
}
