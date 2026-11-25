#ifndef CompanionVersion
#define CompanionVersion "0.2.0"
#endif
[Setup]
AppId={{15FDAE4C-EA77-4A64-81D1-84F95432BECB}
AppName=NeuroReach
AppVersion={#CompanionVersion}
AppPublisher=NeuroReach
AppPublisherURL=https://blizzard-labs.github.io/thalis-rehab-game/
AppSupportURL=https://github.com/blizzard-labs/thalis-rehab-game#companion-setup
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
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
Name: "{userprograms}\NeuroReach"; Filename: "{app}\NeuroReach.exe"
[Run]
Filename: "{app}\NeuroReach.exe"; Flags: postinstall nowait skipifsilent
