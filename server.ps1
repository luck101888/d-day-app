# server.ps1 - Simple PowerShell Static Server
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "Server successfully started at http://localhost:$port/"
    
    # Automatically open the browser
    Start-Process "http://localhost:$port/"
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Parse URL
        $urlPath = $request.RawUrl.Split('?')[0]
        if ($urlPath -eq "" -or $urlPath -eq "/") {
            $urlPath = "/index.html"
        }
        
        # Sanitize path to prevent directory traversal
        $urlPath = $urlPath.Replace("/", "\").TrimStart("\")
        $filePath = Join-Path (Get-Location) $urlPath
        
        # If path points to a directory, ensure it ends with a trailing slash (302 redirect)
        if (Test-Path $filePath -PathType Container) {
            if (!$request.RawUrl.Split('?')[0].EndsWith("/")) {
                $response.StatusCode = 302
                $response.Redirect($request.RawUrl + "/")
                $response.OutputStream.Close()
                continue
            }
            $filePath = Join-Path $filePath "index.html"
        }
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Content Type header with UTF-8 support for Korean text
            if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css; charset=utf-8" }
            elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript; charset=utf-8" }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errorMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errorMsg, 0, $errorMsg.Length)
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Error $_
} finally {
    $listener.Close()
}
