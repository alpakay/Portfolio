# Resize PNG screenshots to max 1600px wide, re-encode as JPEG.
# Reduces megaboom screenshots from ~7 MB to <500 KB while preserving readable quality.

Add-Type -AssemblyName System.Drawing

$maxWidth = 1600
$quality = 85

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

$pngs = Get-ChildItem -Path "public\images" -Filter "*.png"

foreach ($png in $pngs) {
    $srcPath = $png.FullName
    $img = [System.Drawing.Image]::FromFile($srcPath)

    $w = $img.Width
    $h = $img.Height

    if ($w -gt $maxWidth) {
        $ratio = $maxWidth / $w
        $newW = $maxWidth
        $newH = [int]($h * $ratio)
    } else {
        $newW = $w
        $newH = $h
    }

    $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $newW, $newH)

    $jpgPath = [System.IO.Path]::ChangeExtension($srcPath, '.jpg')
    $bmp.Save($jpgPath, $jpegCodec, $encoderParams)

    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()

    $oldKB = [math]::Round($png.Length / 1KB, 1)
    $newKB = [math]::Round((Get-Item $jpgPath).Length / 1KB, 1)
    Write-Output "$($png.Name) ($($w)x$($h), $oldKB KB) -> $(Split-Path $jpgPath -Leaf) ($($newW)x$($newH), $newKB KB)"

    Remove-Item $srcPath -Force
}
