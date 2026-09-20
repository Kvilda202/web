param([int]$Port = 8080)
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

$mime = @{
  ".html"="text/html"; ".htm"="text/html"; ".css"="text/css"; ".js"="application/javascript";
  ".json"="application/json"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".png"="image/png";
  ".webp"="image/webp"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".txt"="text/plain";
  ".rules"="text/plain"; ".md"="text/markdown";
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $root ($path -replace "^/","")
    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
      $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentType = $ct
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
