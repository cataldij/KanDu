$apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cWhwY214ZWt0YmlucGl6cG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNTkwODgsImV4cCI6MjA4MzczNTA4OH0.n0I1wsoSMLiUOllglvojRE7ByS2JJVdK7YCZ1OmDtN8"
$baseUrl = "https://fxqhpcmxektbinpizpmw.supabase.co"

# Test 1: Call diagnose without auth (should get 401)
Write-Host "Test 1: Calling diagnose without auth token..."
try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/functions/v1/diagnose" -Method POST -Headers @{
        "apikey" = $apikey
        "Content-Type" = "application/json"
    } -Body '{"category":"appliances","description":"test"}'
    Write-Host "SUCCESS: $resp"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "ERROR Status: $status"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "ERROR Body: $body"
    }
}

Write-Host ""
Write-Host "To test with a real auth token, sign in and get a token from the app logs."
