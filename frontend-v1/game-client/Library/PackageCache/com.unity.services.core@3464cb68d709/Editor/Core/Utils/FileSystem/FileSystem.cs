using System.IO;

namespace Unity.Services.Core.Editor
{
    class FileSystem : IFileSystem
    {
        public string GetFileContent(string path)
        {
            if (FileExists(path))
            {
                return File.ReadAllText(path);
            }

            return string.Empty;
        }

        public void CreateFile(string path)
        {
            if (FileExists(path))
            {
                return;
            }

            var fileDirectoryName = Path.GetDirectoryName(path);
            if (!Directory.Exists(fileDirectoryName) && !string.IsNullOrEmpty(fileDirectoryName))
            {
                Directory.CreateDirectory(fileDirectoryName);
            }

            var fileStream = File.Create(path);
            fileStream.Close();
        }

        public void SaveFile(string path, string fileContent)
        {
            if (!FileExists(path))
            {
                CreateFile(path);
            }

            File.WriteAllText(path, fileContent);
        }

        public bool FileExists(string path)
        {
            return File.Exists(path);
        }
    }
}
