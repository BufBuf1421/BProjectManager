#define MyAppName "BProjectManager"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "BufBuf1421"
#define MyAppURL "https://github.com/BufBuf1421/BProjectManager"
#define MyAppExeName "launcher.bat"

[Setup]
AppId={{B91C8E72-3F4D-4B58-B8E9-D2F4C8A9E2F0}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=LICENSE
OutputDir=installer
OutputBaseFilename=BProjectManager-{#MyAppVersion}-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
CreateAppDir=yes
DisableDirPage=no
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\icons\app_icon.ico

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Основные файлы приложения
Source: "main.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "python_setup.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "project_window.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "settings_dialog.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "updater.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "version.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "requirements.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "styles.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "create_project_dialog.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "search_panel.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "project_card.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "project_group.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "icons\*"; DestDir: "{app}\icons"; Flags: ignoreversion recursesubdirs createallsubdirs

; Встроенный Python со всеми зависимостями
Source: "python\*"; DestDir: "{app}\python"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launcher
Source: "launcher.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icons\app_icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icons\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\*"
Type: dirifempty; Name: "{app}\python\Lib\site-packages"
Type: dirifempty; Name: "{app}\python\Lib"
Type: dirifempty; Name: "{app}\python"
Type: dirifempty; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end; 