#ifndef PrototypeVersion
#define PrototypeVersion "0.1"
#endif
[Setup]
AppId={{15FDAE4C-EA77-4A64-81D1-84F95432BECB}
AppName=NeuroReach
AppVersion={#PrototypeVersion}
DefaultDirName={localappdata}\Programs\NeuroReach
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
OutputDir=..\dist
OutputBaseFilename=NeuroReach-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\NeuroReach.exe
[Files]
Source: "..\dist\NeuroReach\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{userprograms}\NeuroReach"; Filename: "{app}\NeuroReach.exe"; Parameters: "--open-browser"
[Run]
Filename: "{app}\NeuroReach.exe"; Parameters: "--open-browser"; Flags: postinstall nowait skipifsilent
