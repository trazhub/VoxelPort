$ErrorActionPreference = "Stop"

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$build   = Join-Path $root "build"
$classes = Join-Path $build "classes"
$input   = Join-Path $build "input"
$dist    = Join-Path $root "dist"
$jar     = Join-Path $input "VoxelPort.jar"
$lib     = Join-Path $root "lib"
$appImageDir = Join-Path $dist "VoxelPort"
$zipPath     = Join-Path $dist "VoxelPort-1.0.0-windows-x64.zip"

Remove-Item -LiteralPath $build,$dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $classes | Out-Null
New-Item -ItemType Directory -Force $input   | Out-Null
New-Item -ItemType Directory -Force $dist    | Out-Null

# Collect all library jars for classpath
$libJars = (Get-ChildItem -Path $lib -Filter "*.jar" -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName) -join ";"

$sources = Get-ChildItem -Path (Join-Path $root "src\main\java") -Recurse -Filter *.java |
           Select-Object -ExpandProperty FullName

$addMods = "java.net.http,java.management"
if ($libJars) {
    javac --release 17 -encoding UTF-8 --add-modules $addMods -cp $libJars -d $classes $sources
} else {
    javac --release 17 -encoding UTF-8 --add-modules $addMods -d $classes $sources
}

# Build fat-jar: unpack libs first then add our classes on top
if ($libJars) {
    $libJarList = Get-ChildItem -Path $lib -Filter "*.jar" -ErrorAction SilentlyContinue
    foreach ($lj in $libJarList) {
        $extractDir = Join-Path $build ("extract_" + $lj.BaseName)
        New-Item -ItemType Directory -Force $extractDir | Out-Null
        Push-Location $extractDir
        jar xf $lj.FullName
        Pop-Location
        # Merge into classes (skip META-INF manifest)
        Get-ChildItem -Path $extractDir -Recurse -File |
            Where-Object { $_.FullName -notmatch "META-INF[/\\]MANIFEST" } |
            ForEach-Object {
                $rel = $_.FullName.Substring($extractDir.Length + 1)
                $dest = Join-Path $classes $rel
                New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
                Copy-Item $_.FullName $dest -Force
            }
    }
}

jar --create --file $jar --main-class org.localm.LocalMJava -C $classes .

$runtimeImage = Join-Path $build "runtime"
jlink --add-modules java.desktop,java.net.http,java.logging,java.management,jdk.crypto.ec,jdk.zipfs `
      --output $runtimeImage --strip-debug --no-header-files --no-man-pages

# Bundle required tools into the jpackage input so installer includes them.
Copy-Item -LiteralPath (Join-Path $root "bin") -Destination $input -Recurse -Force

jpackage `
  --type app-image `
  --name "VoxelPort" `
  --input $input `
  --main-jar "VoxelPort.jar" `
  --main-class "org.localm.LocalMJava" `
  --runtime-image $runtimeImage `
  --dest $dist `
  --app-version "1.0.0" `
  --vendor "VoxelPort"

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $appImageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Built app image:"
Write-Host (Join-Path $appImageDir "VoxelPort.exe")
Write-Host "Built release zip:"
Write-Host $zipPath
