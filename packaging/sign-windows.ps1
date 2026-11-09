# Run on a release workstation that already has its code-signing certificate.
param(
    [Parameter(Mandatory)][string]$CertificateThumbprint,
    [Parameter(Mandatory)][uri]$TimestampUrl,
    [Parameter(Mandatory)][string]$File
)
$ErrorActionPreference = "Stop"
if ($TimestampUrl.Scheme -ne "https") { throw "Use the HTTPS timestamp URL provided by your certificate authority." }
$target = (Resolve-Path $File).Path
if ([IO.Path]::GetExtension($target) -ne ".exe") { throw "Select an executable or installer." }
& signtool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl.AbsoluteUri /td SHA256 $target
if ($LASTEXITCODE -ne 0) { throw "Code signing failed." }
& signtool verify /pa /v $target
if ($LASTEXITCODE -ne 0) { throw "Signature verification failed." }
