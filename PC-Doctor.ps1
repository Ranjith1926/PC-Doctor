<#
    PC Doctor v1.1 - performance score, safe cleanup, startup manager,
    app uninstaller and speed tweaks for Windows 10 / 11.

    How to run:  double-click Run-PC-Doctor.bat (it asks for admin rights).
    No questions: double-click Run-PC-Doctor-AUTO.bat
    Report only: powershell -ExecutionPolicy Bypass -File PC-Doctor.ps1 -ReportOnly

    Safety rules built into this tool:
      * Nothing is deleted or changed without showing a preview and asking you first.
      * Your Downloads, Documents, Desktop, Pictures and project folders are never touched.
      * A Windows restore point is created before uninstalls and tweaks (if System Protection is on).
      * Startup apps are disabled the same way Task Manager does it, so you can re-enable them.
      * Everything is logged to %USERPROFILE%\PC-Doctor\
#>
[CmdletBinding()]
param(
    [switch]$ReportOnly,
    [switch]$Auto,        # run the full tune-up with no questions
    [switch]$Unattended   # used by the weekly schedule: no pauses, no windows opened
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

# ---------------------------------------------------------------- setup ---

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $id
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Re-launch with administrator rights (Windows shows the UAC "Yes / No" prompt).
if (-not (Test-Admin)) {
    Write-Host 'PC Doctor needs administrator rights. Please click "Yes" on the next prompt.' -ForegroundColor Yellow
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($ReportOnly) { $argList += ' -ReportOnly' }
    if ($Auto)       { $argList += ' -Auto' }
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -ErrorAction Stop
    } catch {
        Write-Host 'Administrator permission was not granted. Exiting.' -ForegroundColor Red
        Start-Sleep -Seconds 3
    }
    exit
}

$Script:OutDir = Join-Path $env:USERPROFILE 'PC-Doctor'
New-Item -ItemType Directory -Path $Script:OutDir -Force | Out-Null
$Script:LogFile     = Join-Path $Script:OutDir ('log-{0:yyyyMMdd-HHmmss}.txt' -f (Get-Date))
$Script:HistoryFile = Join-Path $Script:OutDir 'score-history.csv'
$Script:RestorePointDone = $false

# --------------------------------------------------------------- helpers ---

function Write-Log {
    param([string]$Message, [string]$Color = 'Gray')
    $line = '[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $Script:LogFile -Value $line
}

function Write-Title([string]$Text) {
    Write-Host ''
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
}

function Format-Size([double]$Bytes) {
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
    return ('{0:N0} B' -f $Bytes)
}

function Get-Median([double[]]$Values) {
    if (-not $Values -or $Values.Count -eq 0) { return 0 }
    $sorted = $Values | Sort-Object
    $mid = [int][math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 1) { return [double]$sorted[$mid] }
    return ([double]$sorted[$mid - 1] + [double]$sorted[$mid]) / 2
}

function Wait-ForSettle([int]$Seconds = 60) {
    Write-Log "Waiting $Seconds seconds for Windows to settle before measuring again..." 'Yellow'
    for ($s = $Seconds; $s -gt 0; $s -= 5) {
        Write-Host ("`r  {0,3} s left " -f $s) -NoNewline
        Start-Sleep -Seconds 5
    }
    Write-Host ''
}

function Get-State {
    $file = Join-Path $Script:OutDir 'state.json'
    if (Test-Path $file) {
        try { return (Get-Content $file -Raw | ConvertFrom-Json) } catch { }
    }
    return [pscustomobject]@{ LastDevClean = ''; LastDism = '' }
}

function Save-State($State) {
    $State | ConvertTo-Json | Set-Content -Path (Join-Path $Script:OutDir 'state.json') -Encoding UTF8
}

function Get-DaysSince($Date) {
    if ($Date -is [datetime]) { return ((Get-Date) - $Date).TotalDays }
    if ([string]::IsNullOrWhiteSpace([string]$Date)) { return 9999 }
    try { return ((Get-Date) - [datetime]::Parse([string]$Date, [Globalization.CultureInfo]::InvariantCulture)).TotalDays } catch { return 9999 }
}

function Confirm-Step([string]$Question) {
    $answer = Read-Host "$Question [y/N]"
    return ($answer -match '^(y|yes)$')
}

function Get-FreeSpace([string]$Drive = 'C:') {
    $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$Drive'"
    return [double]$d.FreeSpace
}

function Get-PathSize([string[]]$Paths) {
    $total = [double]0
    foreach ($p in $Paths) {
        foreach ($item in @(Get-Item -Path $p -Force -ErrorAction SilentlyContinue)) {
            if ($item.PSIsContainer) {
                $sum = (Get-ChildItem -LiteralPath $item.FullName -Recurse -Force -File -ErrorAction SilentlyContinue |
                        Measure-Object -Property Length -Sum).Sum
            } else {
                $sum = $item.Length
            }
            if ($sum) { $total += [double]$sum }
        }
    }
    return $total
}

# Guard: refuse anything that could be a drive root or a short/odd path.
function Test-SafeCleanPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if ($Path.StartsWith('\'))             { return $false }
    if ($Path -match '^[A-Za-z]:\\?\*?$')   { return $false }
    if ($Path.Length -lt 15)                { return $false }
    $blocked = @('\Documents', '\Desktop', '\Downloads', '\Pictures', '\Videos', '\Music',
                 '\OneDrive', '\source', '\AndroidStudioProjects', '\Program Files')
    foreach ($b in $blocked) {
        if ($Path -like "*$b\*" -or $Path -like "*$b") { return $false }
    }
    return $true
}

function Remove-PathContents([string[]]$Paths) {
    foreach ($p in $Paths) {
        if (-not (Test-SafeCleanPath $p)) {
            Write-Log "Skipped unsafe path: $p" 'Red'
            continue
        }
        foreach ($item in @(Get-Item -Path $p -Force -ErrorAction SilentlyContinue)) {
            if (-not (Test-SafeCleanPath $item.FullName)) { continue }
            # Files in use are skipped automatically (they are simply left in place).
            Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function New-SafetyRestorePoint {
    if ($Script:RestorePointDone) { return }
    Write-Log 'Creating a Windows restore point (can take a minute)...' 'Yellow'
    try {
        Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
        Checkpoint-Computer -Description 'Before PC Doctor changes' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
        Write-Log 'Restore point created.' 'Green'
    } catch {
        Write-Log "Restore point not created ($($_.Exception.Message)). Continuing." 'DarkYellow'
    }
    $Script:RestorePointDone = $true
}

function Test-ProcessRunning([string[]]$Names) {
    foreach ($n in $Names) {
        if (Get-Process -Name $n -ErrorAction SilentlyContinue) { return $true }
    }
    return $false
}

# --------------------------------------------------------- cleanup list ---

function Get-CleanupTargets {
    $la = $env:LOCALAPPDATA
    $up = $env:USERPROFILE
    $sr = $env:SystemRoot
    $pd = $env:ProgramData

    return @(
        [pscustomobject]@{ Group='System';    Name='Your temp files';                 Process=@();
            Paths=@("$env:TEMP\*") }
        [pscustomobject]@{ Group='System';    Name='Windows temp files';              Process=@();
            Paths=@("$sr\Temp\*") }
        [pscustomobject]@{ Group='System';    Name='Windows Update download cache';   Process=@();
            Paths=@("$sr\SoftwareDistribution\Download\*") }
        [pscustomobject]@{ Group='System';    Name='Delivery Optimization cache';     Process=@();
            Paths=@("$sr\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache\*") }
        [pscustomobject]@{ Group='System';    Name='Error reports and crash dumps';   Process=@();
            Paths=@("$pd\Microsoft\Windows\WER\ReportArchive\*", "$pd\Microsoft\Windows\WER\ReportQueue\*",
                    "$la\CrashDumps\*", "$sr\Minidump\*") }
        [pscustomobject]@{ Group='System';    Name='Thumbnail cache';                 Process=@();
            Paths=@("$la\Microsoft\Windows\Explorer\thumbcache_*.db") }
        [pscustomobject]@{ Group='Browser';   Name='Google Chrome cache';             Process=@('chrome');
            Paths=@("$la\Google\Chrome\User Data\*\Cache\*", "$la\Google\Chrome\User Data\*\Code Cache\*",
                    "$la\Google\Chrome\User Data\*\GPUCache\*") }
        [pscustomobject]@{ Group='Browser';   Name='Microsoft Edge cache';            Process=@('msedge');
            Paths=@("$la\Microsoft\Edge\User Data\*\Cache\*", "$la\Microsoft\Edge\User Data\*\Code Cache\*",
                    "$la\Microsoft\Edge\User Data\*\GPUCache\*") }
        [pscustomobject]@{ Group='Developer'; Name='npm cache';                       Process=@('node');
            Paths=@("$la\npm-cache\_cacache\*", "$up\npm-cache\_cacache\*", "$env:APPDATA\npm-cache\_cacache\*") }
        [pscustomobject]@{ Group='Developer'; Name='Yarn / pip caches';               Process=@();
            Paths=@("$la\Yarn\Cache\*", "$la\pip\Cache\*") }
        [pscustomobject]@{ Group='Developer'; Name='NuGet HTTP / scratch caches';     Process=@('devenv', 'dotnet');
            Paths=@("$la\NuGet\v3-cache\*", "$la\NuGet\http-cache\*", "$la\NuGet\plugins-cache\*") }
        [pscustomobject]@{ Group='Developer'; Name='Gradle build caches';             Process=@('studio64', 'java');
            Paths=@("$up\.gradle\caches\*", "$up\.gradle\daemon\*") }
        [pscustomobject]@{ Group='Heavy';     Name='NuGet packages (re-downloaded on next restore)'; Process=@('devenv', 'dotnet');
            Paths=@("$up\.nuget\packages\*") }
    )
}

function Get-RecycleBinSize {
    try {
        $shell = New-Object -ComObject Shell.Application
        $total = [double]0
        foreach ($i in $shell.NameSpace(10).Items()) { $total += [double]$i.ExtendedProperty('Size') }
        return $total
    } catch { return [double]0 }
}

# --------------------------------------------------------- startup apps ---

$Script:KeepPattern = 'SecurityHealth|Defender|Realtek|Rtk|Synaptics|ELAN|igfx|Intel|AMD|NVIDIA|Audio|Touchpad|Bluetooth|' +
                      'Quick ?Heal|K7|McAfee|Norton|Kaspersky|Avast|AVG|ESET|Sophos|Trend ?Micro|Bitdefender|' +
                      'CrowdStrike|SentinelOne|Forcepoint|Zscaler|GlobalProtect|FortiClient|Cisco|VPN'

function Get-ApprovedEnabled([string]$ApprovedKey, [string]$Name) {
    try {
        $value = (Get-ItemProperty -Path $ApprovedKey -Name $Name -ErrorAction Stop).$Name
        if ($value -and $value.Length -gt 0) { return (($value[0] % 2) -eq 0) }
    } catch { }
    return $true
}

function Set-ApprovedEnabled([string]$ApprovedKey, [string]$Name, [bool]$Enable) {
    if (-not (Test-Path $ApprovedKey)) { New-Item -Path $ApprovedKey -Force | Out-Null }
    $bytes = New-Object byte[] 12
    if ($Enable) {
        $bytes[0] = 2
    } else {
        $bytes[0] = 3
        [BitConverter]::GetBytes((Get-Date).ToFileTime()).CopyTo($bytes, 4)
    }
    New-ItemProperty -Path $ApprovedKey -Name $Name -PropertyType Binary -Value $bytes -Force | Out-Null
}

function Get-StartupEntries {
    $approvedBase = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'
    $entries = @()

    $runSources = @(
        @{ Hive='HKCU:'; Run='Software\Microsoft\Windows\CurrentVersion\Run';             Approved="$approvedBase\Run" },
        @{ Hive='HKLM:'; Run='Software\Microsoft\Windows\CurrentVersion\Run';             Approved="$approvedBase\Run" },
        @{ Hive='HKLM:'; Run='Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; Approved="$approvedBase\Run32" }
    )
    foreach ($s in $runSources) {
        $runKey = "$($s.Hive)\$($s.Run)"
        if (-not (Test-Path $runKey)) { continue }
        $key = Get-Item -Path $runKey
        $approvedKey = "$($s.Hive)\$($s.Approved)"
        foreach ($name in $key.GetValueNames()) {
            if ([string]::IsNullOrEmpty($name)) { continue }
            $entries += [pscustomobject]@{
                Name        = $name
                Command     = [string]$key.GetValue($name)
                Scope       = $(if ($s.Hive -eq 'HKCU:') { 'You' } else { 'All users' })
                ApprovedKey = $approvedKey
                Enabled     = (Get-ApprovedEnabled $approvedKey $name)
            }
        }
    }

    $folderSources = @(
        @{ Path="$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup";   Approved="HKCU:\$approvedBase\StartupFolder"; Scope='You' },
        @{ Path="$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"; Approved="HKLM:\$approvedBase\StartupFolder"; Scope='All users' }
    )
    foreach ($f in $folderSources) {
        foreach ($file in @(Get-ChildItem -LiteralPath $f.Path -File -ErrorAction SilentlyContinue)) {
            if ($file.Name -eq 'desktop.ini') { continue }
            $entries += [pscustomobject]@{
                Name        = $file.Name
                Command     = $file.FullName
                Scope       = $f.Scope
                ApprovedKey = $f.Approved
                Enabled     = (Get-ApprovedEnabled $f.Approved $file.Name)
            }
        }
    }
    return $entries
}

# --------------------------------------------------------- health check ---

function Get-HealthData {
    Write-Log 'Measuring CPU, memory, disk and startup load (about 15 seconds)...' 'Yellow'

    $os  = Get-CimInstance Win32_OperatingSystem
    $cs  = Get-CimInstance Win32_ComputerSystem
    $cpuInfo = Get-CimInstance Win32_Processor | Select-Object -First 1

    # CPU and memory: 10 samples, 1 second apart. The MEDIAN is used so one short
    # spike (an app starting, a restore point, DISM finishing) does not skew the score.
    $cpuVals = @()
    $ramVals = @()
    $useCounter = $true
    for ($i = 0; $i -lt 10; $i++) {
        if ($useCounter) {
            try {
                $c = Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
                $cpuVals += [double]$c.CounterSamples[0].CookedValue
            } catch { $useCounter = $false }
        }
        if (-not $useCounter) {
            $cpuVals += [double](Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
            Start-Sleep -Seconds 1
        }
        $o = Get-CimInstance Win32_OperatingSystem
        $ramVals += (([double]$o.TotalVisibleMemorySize - [double]$o.FreePhysicalMemory) / [double]$o.TotalVisibleMemorySize) * 100
    }
    $cpuLoad    = [math]::Round((Get-Median $cpuVals), 0)
    $ramUsedPct = [math]::Round((Get-Median $ramVals), 0)
    $totalRam   = [double]$os.TotalVisibleMemorySize * 1KB

    $sysDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
    $diskFreePct = [math]::Round(([double]$sysDrive.FreeSpace / [double]$sysDrive.Size) * 100, 0)

    $media = 'Unknown'
    try {
        $diskNumber = (Get-Partition -DriveLetter $env:SystemDrive.TrimEnd(':') -ErrorAction Stop).DiskNumber
        $pdisk = Get-PhysicalDisk -ErrorAction Stop | Where-Object { $_.DeviceId -eq "$diskNumber" } | Select-Object -First 1
        if ($pdisk) {
            if ([string]$pdisk.BusType -eq 'NVMe') { $media = 'SSD (NVMe)' }
            elseif ([string]$pdisk.MediaType -eq 'SSD') { $media = 'SSD' }
            elseif ([string]$pdisk.MediaType -eq 'HDD') { $media = 'HDD' }
        }
    } catch { }

    $startup = @(Get-StartupEntries)
    $startupOn = @($startup | Where-Object { $_.Enabled }).Count

    $junk = [double]0
    foreach ($t in (Get-CleanupTargets | Where-Object { $_.Group -in @('System', 'Browser') })) {
        $junk += Get-PathSize $t.Paths
    }
    $junk += Get-RecycleBinSize

    $uptimeDays = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)

    $powerPlan = 'Unknown'
    try {
        $pp = (powercfg /getactivescheme) 2>$null
        if ($pp -match '\((.+)\)') { $powerPlan = $Matches[1] }
    } catch { }

    $topApps = Get-Process | Group-Object -Property ProcessName | ForEach-Object {
        [pscustomobject]@{
            Name      = $_.Name
            MemoryMB  = [math]::Round((($_.Group | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB, 0)
            Processes = $_.Count
        }
    } | Sort-Object -Property MemoryMB -Descending | Select-Object -First 12

    return [pscustomobject]@{
        Computer    = $env:COMPUTERNAME
        Windows     = "$($os.Caption) (build $($os.BuildNumber))"
        Cpu         = $cpuInfo.Name.Trim()
        Cores       = "$($cpuInfo.NumberOfCores) cores / $($cpuInfo.NumberOfLogicalProcessors) threads"
        CpuLoad     = $cpuLoad
        RamTotal    = $totalRam
        RamUsedPct  = $ramUsedPct
        DiskSize    = [double]$sysDrive.Size
        DiskFree    = [double]$sysDrive.FreeSpace
        DiskFreePct = $diskFreePct
        DiskType    = $media
        StartupOn   = $startupOn
        StartupAll  = $startup.Count
        Junk        = $junk
        UptimeDays  = $uptimeDays
        PowerPlan   = $powerPlan
        TopApps     = $topApps
        Model       = "$($cs.Manufacturer) $($cs.Model)"
    }
}

function Get-Score($h) {
    $rows = @()
    $tips = @()

    # Memory (25)
    if     ($h.RamUsedPct -le 60) { $p = 25 }
    elseif ($h.RamUsedPct -le 75) { $p = 20 }
    elseif ($h.RamUsedPct -le 85) { $p = 12; $tips += 'Memory is busy: close apps you are not using (see "Top memory users") and disable startup apps (menu 3).' }
    else                          { $p = 5;  $tips += 'Memory is almost full: close heavy apps, disable startup apps (menu 3). If this happens daily, a RAM upgrade will help most.' }
    $rows += [pscustomobject]@{ Check='Memory in use'; Value="$($h.RamUsedPct)% of $(Format-Size $h.RamTotal)"; Points=$p; Max=25 }

    # Disk free (25)
    if     ($h.DiskFreePct -ge 25) { $p = 25 }
    elseif ($h.DiskFreePct -ge 15) { $p = 18; $tips += 'C: drive is getting full: run cleanup (menu 2) and remove unused apps (menu 4).' }
    elseif ($h.DiskFreePct -ge 10) { $p = 10; $tips += 'C: drive is low on space, which slows Windows down: run cleanup (menu 2) and remove large unused apps (menu 4).' }
    else                           { $p = 3;  $tips += 'C: drive is critically full: run cleanup (menu 2) including Developer caches, and uninstall large apps (menu 4).' }
    $rows += [pscustomobject]@{ Check='Free space on C:'; Value="$(Format-Size $h.DiskFree) free ($($h.DiskFreePct)%)"; Points=$p; Max=25 }

    # CPU (15)
    if     ($h.CpuLoad -le 30) { $p = 15 }
    elseif ($h.CpuLoad -le 60) { $p = 10; $tips += 'CPU is moderately busy while idle: check "Top memory users" and Task Manager for background apps.' }
    else                       { $p = 4;  $tips += 'CPU is very busy: open Task Manager > Processes, sort by CPU and close or uninstall the culprit.' }
    $rows += [pscustomobject]@{ Check='CPU load (5 s average)'; Value="$($h.CpuLoad)%"; Points=$p; Max=15 }

    # Startup (10)
    if     ($h.StartupOn -le 8)  { $p = 10 }
    elseif ($h.StartupOn -le 15) { $p = 6; $tips += 'Many apps start with Windows: disable the ones you do not need (menu 3).' }
    else                         { $p = 2; $tips += 'Too many apps start with Windows: disable the ones you do not need (menu 3).' }
    $rows += [pscustomobject]@{ Check='Startup apps enabled'; Value="$($h.StartupOn) of $($h.StartupAll)"; Points=$p; Max=10 }

    # Junk (10)
    if     ($h.Junk -lt 1GB) { $p = 10 }
    elseif ($h.Junk -lt 5GB) { $p = 6; $tips += 'Junk files found: run cleanup (menu 2).' }
    else                     { $p = 2; $tips += 'Lots of junk files: run cleanup (menu 2).' }
    $rows += [pscustomobject]@{ Check='Junk files (temp, cache, bin)'; Value=(Format-Size $h.Junk); Points=$p; Max=10 }

    # Disk type (10)
    if     ($h.DiskType -like 'SSD*') { $p = 10 }
    elseif ($h.DiskType -eq 'HDD')    { $p = 3; $tips += 'Windows runs on a hard disk (HDD). Moving to an SSD is the single biggest speed upgrade.' }
    else                              { $p = 7 }
    $rows += [pscustomobject]@{ Check='System disk type'; Value=$h.DiskType; Points=$p; Max=10 }

    # Uptime (5)
    if     ($h.UptimeDays -le 3) { $p = 5 }
    elseif ($h.UptimeDays -le 7) { $p = 3; $tips += 'Restart your PC at least every few days (Shut down with Fast Startup does not fully reset).' }
    else                         { $p = 0; $tips += "PC has not restarted for $($h.UptimeDays) days. Restart it to clear memory leaks and finish updates." }
    $rows += [pscustomobject]@{ Check='Time since last restart'; Value="$($h.UptimeDays) days"; Points=$p; Max=5 }

    if ($h.PowerPlan -match 'saver') { $tips += 'Power plan is Power saver: switch to Best performance (menu 5).' }

    $score = ($rows | Measure-Object -Property Points -Sum).Sum
    if     ($score -ge 85) { $grade = 'Excellent' }
    elseif ($score -ge 70) { $grade = 'Good' }
    elseif ($score -ge 50) { $grade = 'Fair' }
    else                   { $grade = 'Needs attention' }
    if ($tips.Count -eq 0) { $tips += 'Your PC is in great shape. Run this check again every couple of weeks.' }

    return [pscustomobject]@{ Score=$score; Grade=$grade; Rows=$rows; Tips=$tips }
}

function Save-HtmlReport($h, $s, $previous) {
    $enc = { param($t) [System.Net.WebUtility]::HtmlEncode([string]$t) }
    $color = '#1a7f37'
    if ($s.Score -lt 85) { $color = '#2f6fdb' }
    if ($s.Score -lt 70) { $color = '#b76e00' }
    if ($s.Score -lt 50) { $color = '#c62828' }

    $rowsHtml = ($s.Rows | ForEach-Object {
        "<tr><td>$(& $enc $_.Check)</td><td>$(& $enc $_.Value)</td><td class='n'>$($_.Points) / $($_.Max)</td></tr>"
    }) -join "`n"
    $appsHtml = ($h.TopApps | ForEach-Object {
        "<tr><td>$(& $enc $_.Name)</td><td class='n'>$($_.MemoryMB) MB</td><td class='n'>$($_.Processes)</td></tr>"
    }) -join "`n"
    $tipsHtml = ($s.Tips | ForEach-Object { "<li>$(& $enc $_)</li>" }) -join "`n"
    $prevHtml = ''
    if ($previous) { $prevHtml = "<p class='muted'>Previous score: $($previous.Score) on $($previous.Date)</p>" }

    $html = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PC Health Report - $(& $enc $h.Computer)</title>
<style>
 body{font-family:Segoe UI,Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1f2328;background:#f6f8fa}
 .card{background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:20px 24px;margin-bottom:18px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:0 0 12px}
 .score{font-size:56px;font-weight:700;color:$color;line-height:1} .grade{font-size:18px;color:$color;font-weight:600}
 table{width:100%;border-collapse:collapse;font-size:14px} td,th{padding:7px 8px;border-bottom:1px solid #eaeef2;text-align:left}
 th{color:#57606a;font-weight:600} .n{text-align:right;white-space:nowrap} .muted{color:#57606a;font-size:13px}
 li{margin:6px 0}
</style></head><body>
<div class="card">
 <h1>PC Health Report</h1>
 <p class="muted">$(& $enc $h.Computer) &middot; $(& $enc $h.Model) &middot; $(Get-Date -Format 'dd MMM yyyy, HH:mm')</p>
 <div class="score">$($s.Score)<span style="font-size:22px;color:#57606a"> / 100</span></div>
 <div class="grade">$(& $enc $s.Grade)</div>
 $prevHtml
</div>
<div class="card"><h2>Score breakdown</h2>
 <table><tr><th>Check</th><th>Result</th><th class="n">Points</th></tr>
 $rowsHtml
 </table></div>
<div class="card"><h2>What to do next</h2><ul>$tipsHtml</ul></div>
<div class="card"><h2>Top memory users right now</h2>
 <table><tr><th>App</th><th class="n">Memory</th><th class="n">Processes</th></tr>
 $appsHtml
 </table></div>
<div class="card"><h2>System</h2><table>
 <tr><td>Windows</td><td>$(& $enc $h.Windows)</td></tr>
 <tr><td>Processor</td><td>$(& $enc $h.Cpu) ($(& $enc $h.Cores))</td></tr>
 <tr><td>Memory</td><td>$(Format-Size $h.RamTotal)</td></tr>
 <tr><td>C: drive</td><td>$(Format-Size $h.DiskSize), $(& $enc $h.DiskType)</td></tr>
 <tr><td>Power plan</td><td>$(& $enc $h.PowerPlan)</td></tr>
</table></div>
<p class="muted">Generated by PC Doctor. Reports and logs are kept in $(& $enc $Script:OutDir).</p>
</body></html>
"@
    $file = Join-Path $Script:OutDir ('PC-Health-Report-{0:yyyyMMdd-HHmm}.html' -f (Get-Date))
    Set-Content -Path $file -Value $html -Encoding UTF8
    return $file
}

function Invoke-HealthCheck {
    param([switch]$NoOpen, [string]$Label = '')
    Write-Title "Health check and performance score $Label"
    $previous = $null
    if (Test-Path $Script:HistoryFile) {
        $previous = Import-Csv $Script:HistoryFile | Select-Object -Last 1
    }

    $h = Get-HealthData
    $s = Get-Score $h

    Write-Host ''
    $c = 'Green'
    if ($s.Score -lt 85) { $c = 'Cyan' }
    if ($s.Score -lt 70) { $c = 'Yellow' }
    if ($s.Score -lt 50) { $c = 'Red' }
    Write-Host ("  PERFORMANCE SCORE: {0} / 100  ({1})" -f $s.Score, $s.Grade) -ForegroundColor $c
    if ($previous) { Write-Host ("  Previous score:    {0} on {1}" -f $previous.Score, $previous.Date) -ForegroundColor DarkGray }
    Write-Host ''
    $s.Rows | Format-Table -AutoSize Check, Value, @{ n='Points'; e={ "$($_.Points)/$($_.Max)" } } | Out-Host
    Write-Host '  Top memory users:' -ForegroundColor Cyan
    $h.TopApps | Select-Object -First 8 | Format-Table -AutoSize | Out-Host
    Write-Host '  What to do next:' -ForegroundColor Cyan
    foreach ($t in $s.Tips) { Write-Host "   - $t" }

    [pscustomobject]@{
        Date = (Get-Date -Format 'yyyy-MM-dd HH:mm'); Score = $s.Score; RamUsedPct = $h.RamUsedPct
        DiskFreeGB = [math]::Round($h.DiskFree / 1GB, 1); CpuLoad = $h.CpuLoad; StartupOn = $h.StartupOn
        JunkGB = [math]::Round($h.Junk / 1GB, 2)
    } | Export-Csv -Path $Script:HistoryFile -Append -NoTypeInformation

    $report = Save-HtmlReport $h $s $previous
    Write-Log "Score $($s.Score)/100. Report saved: $report" 'Green'
    if (-not $NoOpen) { Start-Process $report }
    return $s.Score
}

# --------------------------------------------------------------- cleanup ---

function Invoke-CleanTarget($t) {
    Write-Log "Cleaning: $($t.Name) ($(Format-Size $t.Size))" 'White'
    if ($t.Name -like 'Windows Update*') {
        Stop-Service -Name wuauserv, bits -Force -ErrorAction SilentlyContinue
        Remove-PathContents $t.Paths
        Start-Service -Name bits, wuauserv -ErrorAction SilentlyContinue
    } elseif ($t.Name -like 'Delivery Optimization*') {
        try { Delete-DeliveryOptimizationCache -Force -ErrorAction Stop } catch { Remove-PathContents $t.Paths }
    } elseif ($t.Name -like 'Gradle*') {
        Get-Process -Name java -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path -like '*gradle*' } | Stop-Process -Force -ErrorAction SilentlyContinue
        Remove-PathContents $t.Paths
    } else {
        Remove-PathContents $t.Paths
    }
}

function Invoke-DismCleanup {
    Write-Log 'Running DISM component cleanup. Please wait, do not close this window...' 'Yellow'
    & Dism.exe /Online /Cleanup-Image /StartComponentCleanup
    $state = Get-State
    $state.LastDism = (Get-Date).ToString('o')
    Save-State $state
}

function Invoke-Cleanup {
    Write-Title 'Clean junk files'
    Write-Log 'Measuring junk files (this can take a minute on a busy PC)...' 'Yellow'

    $targets = Get-CleanupTargets
    $i = 0
    foreach ($t in $targets) {
        $i++
        $t | Add-Member -NotePropertyName Id   -NotePropertyValue $i -Force
        $t | Add-Member -NotePropertyName Size -NotePropertyValue (Get-PathSize $t.Paths) -Force
    }
    $binSize = Get-RecycleBinSize

    Write-Host ''
    $targets | Format-Table -AutoSize Id, Group, Name, @{ n='Size'; e={ Format-Size $_.Size } } | Out-Host
    Write-Host ("  Recycle Bin: {0}" -f (Format-Size $binSize))
    Write-Host ''
    Write-Host '  Your Downloads, Documents, Desktop, Pictures and project folders are never touched.' -ForegroundColor DarkGray
    Write-Host ''

    $freeBefore = Get-FreeSpace $env:SystemDrive
    $selected = @()

    if (Confirm-Step '  Clean all SYSTEM items? (recommended, safe)') {
        $selected += $targets | Where-Object { $_.Group -eq 'System' }
    }
    if (Confirm-Step '  Clean BROWSER caches? (you stay signed in; sites may load slower once)') {
        $selected += $targets | Where-Object { $_.Group -eq 'Browser' }
    }
    if (Confirm-Step '  Clean DEVELOPER caches? (npm, NuGet, Gradle, pip - rebuilt automatically)') {
        $selected += $targets | Where-Object { $_.Group -eq 'Developer' }
    }
    $heavy = $targets | Where-Object { $_.Group -eq 'Heavy' }
    foreach ($hv in $heavy) {
        if ($hv.Size -gt 0 -and (Confirm-Step "  Also clear $($hv.Name), $(Format-Size $hv.Size)?")) { $selected += $hv }
    }
    $emptyBin = $false
    if ($binSize -gt 0) { $emptyBin = Confirm-Step '  Empty the Recycle Bin? (cannot be undone)' }
    $runDism = Confirm-Step '  Run Windows component cleanup (DISM)? Frees old update files; takes 5-15 minutes'

    if (-not $selected -and -not $emptyBin -and -not $runDism) {
        Write-Log 'Nothing selected. No files were deleted.' 'DarkYellow'
        return
    }

    foreach ($t in $selected) {
        if ($t.Process.Count -gt 0 -and (Test-ProcessRunning $t.Process)) {
            Write-Host ("  {0}: please close {1} first." -f $t.Name, ($t.Process -join ' / ')) -ForegroundColor Yellow
            if (-not (Confirm-Step '  Closed it? Continue with this item')) {
                Write-Log "Skipped $($t.Name) (app still open)." 'DarkYellow'
                continue
            }
        }

        Invoke-CleanTarget $t
    }

    if ($emptyBin) {
        Write-Log 'Emptying Recycle Bin...' 'White'
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    }

    if ($runDism) { Invoke-DismCleanup }
    if ($selected | Where-Object { $_.Group -eq 'Developer' }) {
        $state = Get-State
        $state.LastDevClean = (Get-Date).ToString('o')
        Save-State $state
    }

    $freed = (Get-FreeSpace $env:SystemDrive) - $freeBefore
    if ($freed -lt 0) { $freed = 0 }
    Write-Log ("Cleanup finished. Space freed on {0}: {1}. Free now: {2}" -f $env:SystemDrive, (Format-Size $freed), (Format-Size (Get-FreeSpace $env:SystemDrive))) 'Green'
    Write-Host '  (Files that were in use were skipped; they will clear after a restart.)' -ForegroundColor DarkGray
}

# ----------------------------------------------------------- startup UI ---

function Invoke-StartupManager {
    Write-Title 'Startup apps'
    $entries = @(Get-StartupEntries | Sort-Object -Property @{ e={ -not $_.Enabled } }, Name)
    if ($entries.Count -eq 0) { Write-Log 'No startup entries found.'; return }

    $i = 0
    $view = foreach ($e in $entries) {
        $i++
        $note = ''
        if (($e.Name + ' ' + $e.Command) -match $Script:KeepPattern) { $note = 'keep (driver/security)' }
        [pscustomobject]@{
            No      = $i
            Status  = $(if ($e.Enabled) { 'ON' } else { 'off' })
            Name    = $e.Name
            For     = $e.Scope
            Advice  = $note
            Command = $(if ($e.Command.Length -gt 60) { $e.Command.Substring(0, 57) + '...' } else { $e.Command })
        }
    }
    $view | Format-Table -AutoSize No, Status, Name, For, Advice, Command | Out-Host

    Write-Host '  Disabling only stops an app from starting with Windows. It stays installed and you can'
    Write-Host '  turn it back on here or in Task Manager > Startup apps.'
    $answer = Read-Host '  Enter numbers to switch ON/OFF (e.g. 2,5,7), or press Enter to go back'
    if ([string]::IsNullOrWhiteSpace($answer)) { return }

    foreach ($token in ($answer -split '[,\s]+')) {
        $n = 0
        if (-not [int]::TryParse($token, [ref]$n) -or $n -lt 1 -or $n -gt $entries.Count) { continue }
        $e = $entries[$n - 1]
        $newState = -not $e.Enabled
        if (-not $newState -and (($e.Name + ' ' + $e.Command) -match $Script:KeepPattern)) {
            if (-not (Confirm-Step "  '$($e.Name)' looks like a driver or security app. Disable anyway?")) { continue }
        }
        try {
            Set-ApprovedEnabled $e.ApprovedKey $e.Name $newState
            Write-Log ("Startup '{0}' -> {1}" -f $e.Name, $(if ($newState) { 'ON' } else { 'OFF' })) 'Green'
        } catch {
            Write-Log "Could not change '$($e.Name)': $($_.Exception.Message)" 'Red'
        }
    }
    Write-Host '  Changes take effect at next sign-in.' -ForegroundColor DarkGray
}

# ------------------------------------------------------------ uninstall ---

function Get-InstalledApps {
    $keys = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
        Where-Object {
            $_.DisplayName -and $_.UninstallString -and ($_.SystemComponent -ne 1) -and
            (-not $_.ParentKeyName) -and ($_.ReleaseType -notmatch 'Update|Hotfix')
        } |
        ForEach-Object {
            $date = ''
            if ($_.InstallDate -match '^\d{8}$') { $date = '{0}-{1}-{2}' -f $_.InstallDate.Substring(0,4), $_.InstallDate.Substring(4,2), $_.InstallDate.Substring(6,2) }
            [pscustomobject]@{
                Name      = [string]$_.DisplayName
                SizeMB    = [math]::Round(([double]$_.EstimatedSize) / 1024, 0)
                Installed = $date
                Publisher = [string]$_.Publisher
                Version   = [string]$_.DisplayVersion
                Uninstall = [string]$_.UninstallString
            }
        } |
        Sort-Object -Property Name -Unique |
        Sort-Object -Property SizeMB -Descending
}

function Invoke-Uninstaller {
    Write-Title 'Uninstall apps'
    $apps = @(Get-InstalledApps)
    Write-Log "Found $($apps.Count) installed desktop apps."

    $chosen = @()
    if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
        Write-Host '  A window opens with all apps (largest first). Select the ones to remove'
        Write-Host '  (Ctrl+click for several), then click OK. Click Cancel to remove nothing.'
        $chosen = @($apps | Select-Object Name, SizeMB, Installed, Publisher, Version |
                    Out-GridView -Title 'PC Doctor - select apps to UNINSTALL, then click OK' -PassThru)
        $chosen = @($chosen | ForEach-Object { $n = $_.Name; $apps | Where-Object { $_.Name -eq $n } | Select-Object -First 1 })
    } else {
        $i = 0
        $apps | Select-Object -First 80 | ForEach-Object { $i++; '{0,3}. {1} ({2} MB, {3})' -f $i, $_.Name, $_.SizeMB, $_.Publisher } | Out-Host
        $answer = Read-Host '  Enter numbers to uninstall (e.g. 3,9), or press Enter to go back'
        foreach ($token in ($answer -split '[,\s]+')) {
            $n = 0
            if ([int]::TryParse($token, [ref]$n) -and $n -ge 1 -and $n -le $apps.Count) { $chosen += $apps[$n - 1] }
        }
    }

    if ($chosen.Count -eq 0) { Write-Log 'No apps selected.'; return }

    Write-Host ''
    Write-Host '  You selected:' -ForegroundColor Cyan
    $chosen | ForEach-Object { Write-Host "   - $($_.Name) ($($_.SizeMB) MB)" }
    Write-Host '  Note: this is a work PC. Do not remove company security, VPN or management software.' -ForegroundColor Yellow
    if (-not (Confirm-Step '  Uninstall these apps?')) { Write-Log 'Uninstall cancelled.'; return }

    New-SafetyRestorePoint

    foreach ($app in $chosen) {
        if (($app.Name + ' ' + $app.Publisher) -match $Script:KeepPattern) {
            if (-not (Confirm-Step "  '$($app.Name)' looks like a driver/security/VPN app. Really uninstall?")) { continue }
        }
        $cmd = $app.Uninstall -replace '(?i)msiexec(\.exe)?\s+/I', 'MsiExec.exe /X'
        Write-Log "Uninstalling: $($app.Name)  ->  $cmd" 'White'
        Write-Host '  Follow the uninstaller window if one opens...' -ForegroundColor DarkGray
        try {
            $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c "' + $cmd + '"') -Wait -PassThru -ErrorAction Stop
            Write-Log "Finished $($app.Name) (exit code $($proc.ExitCode))." 'Green'
        } catch {
            Write-Log "Could not start uninstaller for $($app.Name): $($_.Exception.Message)" 'Red'
        }
    }
    Write-Host '  Store apps (Microsoft Store) are listed in Settings > Apps > Installed apps.' -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- tweaks ---

function Invoke-Tweaks {
    Write-Title 'Performance tweaks'
    Write-Host '  Each tweak is optional and reversible. You will be asked one by one.'
    Write-Host ''

    if (Confirm-Step '  1) Set power mode to Best performance?') {
        New-SafetyRestorePoint
        $done = $false
        & powercfg /overlaysetactive ded574b5-45a0-4f42-8737-46345c09c238 2>$null
        if ($LASTEXITCODE -eq 0) { $done = $true }
        & powercfg /setactive SCHEME_MIN 2>$null
        if ($LASTEXITCODE -eq 0) { $done = $true }
        if ($done) { Write-Log 'Power mode set to Best performance / High performance.' 'Green' }
        else { Write-Log 'Could not set it automatically. Use Settings > System > Power > Power mode.' 'DarkYellow'; Start-Process 'ms-settings:powersleep' }
        Write-Host '  On a laptop this uses more battery. Switch back in Settings > System > Power.' -ForegroundColor DarkGray
    }

    if (Confirm-Step '  2) Turn on Storage Sense (auto-cleans temp files and old Recycle Bin items weekly)?') {
        $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
        New-Item -Path $k -Force | Out-Null
        Set-ItemProperty -Path $k -Name '01'   -Value 1  -Type DWord   # Storage Sense on
        Set-ItemProperty -Path $k -Name '2048' -Value 7  -Type DWord   # run weekly
        Set-ItemProperty -Path $k -Name '04'   -Value 1  -Type DWord   # delete temp files
        Set-ItemProperty -Path $k -Name '08'   -Value 1  -Type DWord   # clean Recycle Bin
        Set-ItemProperty -Path $k -Name '256'  -Value 30 -Type DWord   # items older than 30 days
        Set-ItemProperty -Path $k -Name '32'   -Value 0  -Type DWord   # never touch Downloads
        Write-Log 'Storage Sense enabled (weekly; Downloads excluded).' 'Green'
    }

    if (Confirm-Step '  3) Adjust visual effects for best performance? (fewer animations; text stays smooth)') {
        New-SafetyRestorePoint
        $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects'
        New-Item -Path $k -Force | Out-Null
        Set-ItemProperty -Path $k -Name 'VisualFXSetting' -Value 3 -Type DWord   # custom
        $adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
        Set-ItemProperty -Path $adv -Name 'TaskbarAnimations' -Value 0 -Type DWord
        Set-ItemProperty -Path $adv -Name 'ListviewAlphaSelect' -Value 0 -Type DWord
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name 'MinAnimate' -Value '0'
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'FontSmoothing' -Value '2'
        Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\DWM' -Name 'EnableAeroPeek' -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Write-Log 'Visual effects reduced. Takes full effect after sign-out.' 'Green'
        Write-Host '  To undo: Start > "Adjust the appearance and performance of Windows" > "Let Windows choose".' -ForegroundColor DarkGray
    }

    if (Confirm-Step '  4) Stop apps running in the background when closed (Windows 11 Store apps)?') {
        $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications'
        New-Item -Path $k -Force | Out-Null
        Set-ItemProperty -Path $k -Name 'GlobalUserDisabled' -Value 1 -Type DWord
        Write-Log 'Background Store apps disabled. (Undo: set GlobalUserDisabled to 0.)' 'Green'
    }

    Write-Host ''
    Write-Host '  Restart your PC to apply everything.' -ForegroundColor Cyan
}

# ------------------------------------------------------- auto tune-up ---

function Set-AutoTweaks {
    # Same tweaks as menu 5, applied silently. Safe to run every time (no change if already set).
    & powercfg /overlaysetactive ded574b5-45a0-4f42-8737-46345c09c238 2>$null | Out-Null
    & powercfg /setactive SCHEME_MIN 2>$null | Out-Null

    $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
    New-Item -Path $k -Force | Out-Null
    Set-ItemProperty -Path $k -Name '01'   -Value 1  -Type DWord
    Set-ItemProperty -Path $k -Name '2048' -Value 7  -Type DWord
    Set-ItemProperty -Path $k -Name '04'   -Value 1  -Type DWord
    Set-ItemProperty -Path $k -Name '08'   -Value 1  -Type DWord
    Set-ItemProperty -Path $k -Name '256'  -Value 30 -Type DWord
    Set-ItemProperty -Path $k -Name '32'   -Value 0  -Type DWord

    $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications'
    New-Item -Path $k -Force | Out-Null
    Set-ItemProperty -Path $k -Name 'GlobalUserDisabled' -Value 1 -Type DWord

    # Stop Windows from using your disk to share updates with other PCs (Delivery Optimization).
    $k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization'
    New-Item -Path $k -Force | Out-Null
    Set-ItemProperty -Path $k -Name 'DODownloadMode' -Value 0 -Type DWord

    Write-Log 'Tweaks checked: Best performance power, Storage Sense, no background Store apps, no update sharing.' 'Green'
}

function Invoke-AutoTuneUp {
    Write-Title 'AUTO tune-up - no questions asked'
    Write-Host '  Rules used in auto mode:' -ForegroundColor DarkGray
    Write-Host '   - System junk and update caches: always cleaned' -ForegroundColor DarkGray
    Write-Host '   - Browser caches: cleaned only if Chrome/Edge are closed' -ForegroundColor DarkGray
    Write-Host '   - Developer caches (npm, Gradle, NuGet HTTP, pip): every 30 days, or sooner if C: is under 15% free' -ForegroundColor DarkGray
    Write-Host '   - DISM component cleanup: once a week' -ForegroundColor DarkGray
    Write-Host '   - Never in auto: Recycle Bin, NuGet packages, startup apps, uninstalls, your personal folders' -ForegroundColor DarkGray

    $before = Invoke-HealthCheck -NoOpen -Label '(before)'

    $state = Get-State
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
    $freePct = ([double]$disk.FreeSpace / [double]$disk.Size) * 100
    $devDue  = ((Get-DaysSince $state.LastDevClean) -ge 30) -or ($freePct -lt 15)
    $dismDue = (Get-DaysSince $state.LastDism) -ge 7

    Write-Title 'Cleaning'
    $freeBefore = Get-FreeSpace $env:SystemDrive
    $devCleaned = $false
    foreach ($t in (Get-CleanupTargets)) {
        $t | Add-Member -NotePropertyName Size -NotePropertyValue (Get-PathSize $t.Paths) -Force
        if ($t.Group -eq 'Heavy') { continue }
        if ($t.Size -le 0) { continue }
        if ($t.Group -eq 'Developer' -and -not $devDue) {
            Write-Log ("Skipped {0} ({1}) - cleaned within the last 30 days, keeps your builds fast." -f $t.Name, (Format-Size $t.Size)) 'DarkGray'
            continue
        }
        if ($t.Process.Count -gt 0 -and (Test-ProcessRunning $t.Process)) {
            Write-Log ("Skipped {0} ({1}) - {2} is open." -f $t.Name, (Format-Size $t.Size), ($t.Process -join '/')) 'DarkGray'
            continue
        }
        Invoke-CleanTarget $t
        if ($t.Group -eq 'Developer') { $devCleaned = $true }
    }
    if ($devCleaned) { $state.LastDevClean = (Get-Date).ToString('o'); Save-State $state }

    if ($dismDue) { Invoke-DismCleanup }
    else { Write-Log 'Skipped DISM - already ran this week.' 'DarkGray' }

    $freed = (Get-FreeSpace $env:SystemDrive) - $freeBefore
    if ($freed -lt 0) { $freed = 0 }
    Write-Log ("Space freed on {0}: {1}" -f $env:SystemDrive, (Format-Size $freed)) 'Green'

    Write-Title 'Tweaks'
    Set-AutoTweaks

    Wait-ForSettle 60
    $after = Invoke-HealthCheck -Label '(after)' -NoOpen:$Unattended

    Write-Title 'Summary'
    Write-Log ("Score before: {0}   Score after: {1}   Space freed: {2}" -f $before, $after, (Format-Size $freed)) 'Cyan'
    if ($after -lt $before) {
        Write-Host '  The score can dip a little if apps were busy while measuring. Restart and run option 1 for a clean reading.' -ForegroundColor DarkGray
    }
}

function Install-AutoSchedule {
    $taskName = 'PC Doctor Auto Tune-up'
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        if (Confirm-Step "  Weekly auto tune-up is already ON. Turn it OFF?") {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
            Write-Log 'Weekly auto tune-up removed.' 'Green'
        }
        return
    }
    $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$PSCommandPath`" -Auto -Unattended"
    $action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
    $trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '1:30PM'
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Log "Weekly auto tune-up scheduled: every Monday 1:30 PM (or at next sign-in if the PC was off)." 'Green'
    Write-Host "  Runs with no prompts. Keep PC-Doctor.ps1 in: $(Split-Path $PSCommandPath)" -ForegroundColor DarkGray
    Write-Host '  Change the day/time in Task Scheduler > "PC Doctor Auto Tune-up". Run option 9 again to turn it off.' -ForegroundColor DarkGray
}

# ------------------------------------------------------------------ main ---

Write-Log "PC Doctor started on $env:COMPUTERNAME. Log: $Script:LogFile" 'DarkGray'

if ($ReportOnly) {
    $null = Invoke-HealthCheck
    Read-Host 'Press Enter to close'
    exit
}

if ($Auto) {
    Invoke-AutoTuneUp
    if (-not $Unattended) {
        Start-Process explorer.exe $Script:OutDir
        Read-Host 'Done. Press Enter to close'
    }
    exit
}

while ($true) {
    Write-Title 'PC Doctor - choose an option'
    Write-Host '   1  Health check + performance score (makes no changes)'
    Write-Host '   2  Clean junk files (shows sizes first, asks before deleting)'
    Write-Host '   3  Manage startup apps'
    Write-Host '   4  Uninstall apps'
    Write-Host '   5  Performance tweaks'
    Write-Host '   6  Full tune-up, asks at each step'
    Write-Host '   7  Open reports folder'
    Write-Host '   8  AUTO tune-up - no questions (recommended)' -ForegroundColor Green
    Write-Host '   9  Schedule AUTO tune-up every week (turn on / off)'
    Write-Host '   Q  Quit'
    $choice = Read-Host '  Your choice'

    switch -Regex ($choice) {
        '^1$' { $null = Invoke-HealthCheck }
        '^2$' { Invoke-Cleanup }
        '^3$' { Invoke-StartupManager }
        '^4$' { Invoke-Uninstaller }
        '^5$' { Invoke-Tweaks }
        '^6$' {
            $null = Invoke-HealthCheck -NoOpen -Label '(before)'
            Invoke-Cleanup
            Invoke-StartupManager
            Invoke-Tweaks
            Wait-ForSettle 60
            $null = Invoke-HealthCheck -Label '(after)'
        }
        '^7$' { Start-Process explorer.exe $Script:OutDir }
        '^8$' { Invoke-AutoTuneUp }
        '^9$' { Install-AutoSchedule }
        '^[qQ]$' { Write-Log 'PC Doctor closed.' 'DarkGray'; exit }
        default { Write-Host '  Please type 1-9 or Q.' -ForegroundColor Yellow }
    }
}
