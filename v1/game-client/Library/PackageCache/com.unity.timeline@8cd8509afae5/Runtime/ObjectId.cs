using System;
using System.Runtime.InteropServices;


namespace UnityEngine.Timeline
{
#if !UNITY_6000_2_OR_NEWER

    [Serializable]
    struct EntityId : IComparable<EntityId>
    {
        public int m_Value;
        public static implicit operator int(EntityId entityId) => entityId.m_Value;
        public static implicit operator EntityId(int instanceId) => new EntityId { m_Value = instanceId };
        public static readonly EntityId None = new EntityId { m_Value = -1 };
        internal static EntityId AllocateNextLowestEntityId() => 1;

        public int CompareTo(EntityId other)
        {
            return m_Value.CompareTo(other.m_Value);
        }
    }

#endif
    [Serializable]
    [StructLayout(LayoutKind.Explicit)]
    struct ObjectId : IEquatable<ObjectId>, IComparable<ObjectId>
    {
        [SerializeField]
        [FieldOffset(0)]
        private EntityId m_Data;

        [FieldOffset(0)]
        private int m_IntData;

        public static readonly ObjectId InvalidId = new ObjectId(EntityId.None);


        internal ObjectId(EntityId data)
        {
            m_IntData = 0; // unused, overwritten by m_Data
            m_Data = data;
        }

        public static implicit operator ObjectId(EntityId entityId)
        {
            return new ObjectId() { m_Data = entityId };
        }

        public static implicit operator EntityId(ObjectId objectId) => objectId.m_Data;


#if !UNITY_6000_4_OR_NEWER
        public static implicit operator int(ObjectId objectId) => objectId.m_IntData;
        public static implicit operator ObjectId(int instanceId) => new ObjectId { m_Data = EntityId.None, m_IntData = instanceId };
#endif

        public override bool Equals(object obj) => obj is ObjectId other && Equals(other);

        public bool Equals(ObjectId other) => m_Data == other.m_Data;

        public int CompareTo(ObjectId other) => this.m_Data.CompareTo(other.m_Data);

        public static bool operator ==(ObjectId left, ObjectId right) => left.Equals(right);

        public static bool operator !=(ObjectId left, ObjectId right) => !left.Equals(right);

        public static bool operator <(ObjectId left, ObjectId right) => left.m_Data < right.m_Data;

        public static bool operator >(ObjectId left, ObjectId right) => left.m_Data > right.m_Data;

        public static bool operator <=(ObjectId left, ObjectId right) => left.m_Data <= right.m_Data;

        public static bool operator >=(ObjectId left, ObjectId right) => left.m_Data >= right.m_Data;

        public override int GetHashCode() => m_Data.GetHashCode();
    }
}
