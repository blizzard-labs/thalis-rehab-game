using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Analytics;

namespace Unity.Services.Analytics.Internal
{
    internal interface IDiskCache
    {
        /// <summary>
        /// Deletes the cache file (if one exists).
        /// </summary>
        void Clear();

        /// <summary>
        /// Compiles the provided list of indices and payload buffer into a binary file and saves it to disk.
        /// </summary>
        /// <param name="eventSummaries">A list of metadata about events that maps to sections of the stream</param>
        /// <param name="payload">The raw UTF8 byte stream of event data</param>
        void Write(List<EventSummary> eventSummaries, Stream payload);

        /// <summary>
        /// Clears and overwrites the contents of the provided metadata list and buffer with data from a binary file from disk.
        /// </summary>
        /// <param name="eventSummaries">A list of metadata about events that maps to sections of the stream</param>
        /// <param name="buffer">The raw UTF8 byte stream of event data</param>
        bool Read(List<EventSummary> eventSummaries, Stream buffer);
    }

    internal interface IFileSystemCalls
    {
        bool CanAccessFileSystem();
        bool FileExists(string path);
        void DeleteFile(string path);

        IWriteStream OpenFileForWriting(string path);
        IReadStream OpenFileForReading(string path);
    }

    internal interface IWriteStream : IDisposable
    {
        bool Ready { get; }

        void Write(byte value);
        void Write(int value);
        void Write(string value);
    }

    internal class WriteStream : IWriteStream
    {
        readonly Stream k_Stream;
        readonly BinaryWriter k_Writer;

        readonly bool k_Ready;

        public bool Ready { get { return k_Ready; } }

        public WriteStream(string path)
        {
            try
            {
                // NOTE: FileMode.Create either makes a new file OR blats the existing one.
                // This is the desired behaviour.
                // See https://learn.microsoft.com/en-us/dotnet/api/system.io.filemode
                k_Stream = new FileStream(path, FileMode.Create);
                k_Writer = new BinaryWriter(k_Stream);
                k_Ready = true;
            }
            catch (IOException)
            {
                // If we fail to initialise (no access permission, disk full, etc) then
                // there is nothing we can do but accept it and move on.

                // Immediately dispose in case we got half-way through initialisation.
                Dispose();
            }
        }

        public void Write(byte value)
        {
            k_Writer.Write(value);
        }

        public void Write(int value)
        {
            k_Writer.Write(value);
        }

        public void Write(string value)
        {
            k_Writer.Write(value);
        }

        public void Dispose()
        {
            // If disposal fails for either the writer or the file stream,
            // there is nothing we can do but accept this and move on.
            try
            {
                if (k_Writer != null)
                {
                    k_Writer.Dispose();
                }
            }
            catch
            {
            }

            try
            {
                if (k_Stream != null)
                {
                    k_Stream.Dispose();
                }
            }
            catch
            {
            }
        }
    }

    internal interface IReadStream : IDisposable
    {
        bool Ready { get; }

        void Skip(int byteCount);

        byte ReadByte();
        string ReadString();
        int ReadInt32();

        void CopyTo(Stream destination);
    }

    internal class ReadStream : IReadStream
    {
        readonly Stream k_Stream;
        readonly BinaryReader k_Reader;

        readonly bool k_Ready;

        public bool Ready { get { return k_Ready; } }

        public ReadStream(string path)
        {
            try
            {
                k_Stream = new FileStream(path, FileMode.Open);
                k_Reader = new BinaryReader(k_Stream);
                k_Ready = true;
            }
            catch (IOException)
            {
                // If we fail to initialise (no access permission, disk full, etc) then
                // there is nothing we can do but accept it and move on.

                // Immediately dispose in case we got half-way through initialisation.
                Dispose();
            }
        }

        public byte ReadByte()
        {
            return k_Reader.ReadByte();
        }

        public string ReadString()
        {
            return k_Reader.ReadString();
        }

        public int ReadInt32()
        {
            return k_Reader.ReadInt32();
        }

        public void Skip(int byteCount)
        {
            k_Reader.ReadBytes(byteCount);
        }

        public void CopyTo(Stream destination)
        {
            destination.SetLength(0);
            destination.Position = 0;
            k_Reader.BaseStream.CopyTo(destination);
        }

        public void Dispose()
        {
            // If disposal fails for either the writer or the file stream,
            // there is nothing we can do but accept this and move on.
            try
            {
                if (k_Reader != null)
                {
                    k_Reader.Dispose();
                }
            }
            catch
            {
            }

            try
            {
                if (k_Stream != null)
                {
                    k_Stream.Dispose();
                }
            }
            catch
            {
            }
        }
    }

    internal class FileSystemCalls : IFileSystemCalls
    {
        readonly bool m_CanAccessFileSystem;

        internal FileSystemCalls()
        {
            m_CanAccessFileSystem =
                // Switch requires a specific setup to have write access to the disc so it won't be handled here.
                Application.platform != RuntimePlatform.Switch &&
                Application.platform != RuntimePlatform.GameCoreXboxOne &&
                Application.platform != RuntimePlatform.GameCoreXboxSeries &&
                Application.platform != RuntimePlatform.PS5 &&
                Application.platform != RuntimePlatform.PS4 &&
                !String.IsNullOrEmpty(Application.persistentDataPath);
        }

        public bool CanAccessFileSystem()
        {
            return m_CanAccessFileSystem;
        }

        public bool FileExists(string path)
        {
            return File.Exists(path);
        }

        public void DeleteFile(string path)
        {
            File.Delete(path);
        }

        public IWriteStream OpenFileForWriting(string path)
        {
            return new WriteStream(path);
        }

        public IReadStream OpenFileForReading(string path)
        {
            return new ReadStream(path);
        }
    }

    internal class DiskCache : IDiskCache
    {
        internal const string k_FileHeaderString = "UGSEventCache";
        internal const int k_CacheFileVersionOne = 1;
        internal const int k_CacheFileVersionTwo = 2;

        private readonly string k_CacheFilePath;
        private readonly IFileSystemCalls k_SystemCalls;
        private readonly long k_CacheFileMaximumSize;

        internal DiskCache(IFileSystemCalls systemCalls)
        {
            if (systemCalls.CanAccessFileSystem())
            {
                // NOTE: On console platforms where file system access is restricted, even asking for the persistentDataPath
                // can cause an exception, let alone trying to write to it. Be careful!

                // NOTE: Since we now have some defence against trying to read files that don't match the new file format,
                // we are safe to keep reusing the same file path. We will simply ignore and delete/overwrite the cache
                // from older SDK versions.
                k_CacheFilePath = $"{Application.persistentDataPath}/eventcache";
            }

            k_SystemCalls = systemCalls;
            k_CacheFileMaximumSize = 5 * 1024 * 1024; // 5MB, 1024B * 1024KB * 5
        }

        internal DiskCache(string cacheFilePath, IFileSystemCalls systemCalls, long maximumFileSize)
        {
            k_CacheFilePath = cacheFilePath;
            k_SystemCalls = systemCalls;
            k_CacheFileMaximumSize = maximumFileSize;
        }

        public void Write(List<EventSummary> eventSummaries, Stream payload)
        {
            if (eventSummaries.Count > 0 &&
                k_SystemCalls.CanAccessFileSystem())
            {
                // Tick through eventEnds until you find the highest one that is still under the file size limit
                int cacheEnd = 0;
                int cacheEventCount = 0;
                for (int e = 0; e < eventSummaries.Count; e++)
                {
                    if (eventSummaries[e].EndIndex < k_CacheFileMaximumSize)
                    {
                        cacheEnd = eventSummaries[e].EndIndex;
                        cacheEventCount = e + 1;
                    }
                }

                IWriteStream writeStream = k_SystemCalls.OpenFileForWriting(k_CacheFilePath);
                if (writeStream.Ready)
                {
                    long payloadOriginalPosition = payload.Position;
                    try
                    {
                        writeStream.Write(k_FileHeaderString);       // a specific string to signal file format validity
                        writeStream.Write(k_CacheFileVersionTwo);    // int version specifier
                        writeStream.Write(cacheEventCount);          // int event count (cropped to maximum file size)
                        for (int i = 0; i < cacheEventCount; i++)
                        {
                            writeStream.Write(eventSummaries[i].StartIndex);     // int32 event start index
                            writeStream.Write(eventSummaries[i].EndIndex);       // int32 event end index
                            writeStream.Write(eventSummaries[i].Id);
                        }

                        payload.Position = 0;
                        for (int i = 0; i < cacheEnd; i++)
                        {
                            // NOTE: the cast to byte is important -- ReadByte actually returns an int, which is 4 bytes.
                            // So you get 3 extra bytes of 0 added if you take it verbatim. Casting to byte cuts it back down to size.
                            writeStream.Write((byte)payload.ReadByte());   // byte[] event data
                        }
                    }
                    catch (Exception)
                    {
                        Debug.LogWarning("Unable to write event cache file: failed to write data to stream");
                    }
                    finally
                    {
                        payload.Position = payloadOriginalPosition;
                        writeStream.Dispose();
                    }
                }
            }
        }

        public void Clear()
        {
            if (k_SystemCalls.CanAccessFileSystem() &&
                k_SystemCalls.FileExists(k_CacheFilePath))
            {
                k_SystemCalls.DeleteFile(k_CacheFilePath);
            }
        }

        public bool Read(List<EventSummary> eventSummaries, Stream buffer)
        {
            if (k_SystemCalls.CanAccessFileSystem() &&
                k_SystemCalls.FileExists(k_CacheFilePath))
            {
#if UNITY_ANALYTICS_EVENT_LOGS
                Debug.Log("Reading cached events: " + k_CacheFilePath);
#endif
                IReadStream readStream = k_SystemCalls.OpenFileForReading(k_CacheFilePath);
                if (readStream.Ready)
                {
                    try
                    {
                        string header = readStream.ReadString();
                        if (header == k_FileHeaderString)
                        {
                            int version = readStream.ReadInt32();
                            switch (version)
                            {
                                case k_CacheFileVersionOne:
                                    ReadVersionOneCacheFile(eventSummaries, readStream, buffer);
                                    return true;
                                case k_CacheFileVersionTwo:
                                    ReadVersionTwoCacheFile(eventSummaries, readStream, buffer);
                                    return true;
                                default:
                                    Debug.LogWarning($"Unable to read event cache file: unknown file format version {version}");
                                    Clear();
                                    break;
                            }
                        }
                        else
                        {
                            Debug.LogWarning("Unable to read event cache file: corrupt");
                            Clear();
                        }
                    }
                    catch (Exception)
                    {
                        Debug.LogWarning("Unable to read event cache file: corrupt");
                        Clear();
                    }
                    finally
                    {
                        readStream.Dispose();
                    }
                }
            }

            return false;
        }

        private void ReadVersionOneCacheFile(in List<EventSummary> eventEndIndices, IReadStream reader, in Stream buffer)
        {
            int eventCount = reader.ReadInt32();            // int32 event count
            for (int i = 0; i < eventCount; i++)
            {
                int eventEndIndex = reader.ReadInt32();     // int32 event end index
                // During migration from old cache format, we have to fill in the blanks.
                // Only the indices are important so this should be fine.
                eventEndIndices.Add(new EventSummary
                {
                    StartIndex = i == 0 ? 0 : eventEndIndices[eventEndIndices.Count - 1].EndIndex,
                    EndIndex = eventEndIndex,
                    Id = $"loadedFromOldCache{i}"
                });
            }

            buffer.SetLength(0);
            buffer.Position = 0;
            // V1 cache files include the 14-byte {"eventList":[ header.
            // We need to skip that because the new buffer does not (it adds the header at serialisation time instead).
            reader.Skip(14);
            reader.CopyTo(buffer);               // byte[] event data is the rest of the file
        }

        private void ReadVersionTwoCacheFile(in List<EventSummary> eventSummaries, IReadStream reader, in Stream buffer)
        {
            int eventCount = reader.ReadInt32();            // int32 event count
            for (int i = 0; i < eventCount; i++)
            {
                int eventStartIndex = reader.ReadInt32();   // int32 event start index
                int eventEndIndex = reader.ReadInt32();     // int32 event end index
                string eventId = reader.ReadString();

                eventSummaries.Add(new EventSummary
                {
                    StartIndex = eventStartIndex,
                    EndIndex = eventEndIndex,
                    Id = eventId
                });
            }

            buffer.SetLength(0);
            buffer.Position = 0;
            reader.CopyTo(buffer);               // byte[] event data is the rest of the file
        }
    }
}
