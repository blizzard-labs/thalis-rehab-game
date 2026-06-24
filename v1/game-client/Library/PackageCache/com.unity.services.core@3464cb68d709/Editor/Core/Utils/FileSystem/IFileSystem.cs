namespace Unity.Services.Core.Editor
{
    interface IFileSystem
    {
        string GetFileContent(string path);

        void CreateFile(string path);

        void SaveFile(string path , string fileContent);

        bool FileExists(string path);
    }
}
