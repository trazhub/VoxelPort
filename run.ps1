$ErrorActionPreference = "Stop"
$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$classes = Join-Path $root "build\classes"
$lib     = Join-Path $root "lib"

New-Item -ItemType Directory -Force $classes | Out-Null

# Collect lib jars
$libJars = (Get-ChildItem -Path $lib -Filter "*.jar" -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName) -join ";"

$sources = Get-ChildItem -Path (Join-Path $root "src\main\java") -Recurse -Filter *.java |
           Select-Object -ExpandProperty FullName

$addMods = "java.net.http,java.management"

if ($libJars) {
    javac --release 17 -encoding UTF-8 `
          --add-modules $addMods `
          -cp $libJars `
          -d $classes $sources
    java --add-modules $addMods `
         --add-opens java.management/sun.management=ALL-UNNAMED `
         --add-opens java.base/java.lang=ALL-UNNAMED `
         -cp "$classes;$libJars" org.localm.LocalMJava
} else {
    javac --release 17 -encoding UTF-8 --add-modules $addMods -d $classes $sources
    java --add-modules $addMods -cp $classes org.localm.LocalMJava
}
