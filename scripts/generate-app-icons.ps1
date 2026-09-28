param([Parameter(Mandatory = $true)][string]$SourcePath)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$publicDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public'))
$iconDir = Join-Path $publicDir 'icons'
[IO.Directory]::CreateDirectory($iconDir) | Out-Null
$source = [Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath).Path)

function Get-IconPng([int]$Size) {
    $bitmap = [Drawing.Bitmap]::new($Size, $Size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = [IO.MemoryStream]::new()
    try {
        $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes = [Drawing.Imaging.ImageAttributes]::new()
        try {
            $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $Size, $Size),
                0, 0, $source.Width, $source.Height, [Drawing.GraphicsUnit]::Pixel, $attributes)
        } finally {
            $attributes.Dispose()
        }
        $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        return ,$stream.ToArray()
    } finally {
        $stream.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    if ($source.Width -ne $source.Height) {
        throw 'The supplied logo must be square; this script does not crop or change its composition.'
    }
    foreach ($size in @(32, 180, 192, 512)) {
        $target = if ($size -eq 180) {
            Join-Path $publicDir 'apple-touch-icon.png'
        } else {
            Join-Path $iconDir "kdeji-$size.png"
        }
        [IO.File]::WriteAllBytes($target, (Get-IconPng $size))
        Write-Output "$target ($size x $size)"
    }

    # ICO directory followed by PNG payloads: preserve the same source at every size.
    $sizes = @(16, 32, 48, 64, 256)
    $images = @($sizes | ForEach-Object { ,(Get-IconPng $_) })
    $output = [IO.MemoryStream]::new()
    $writer = [IO.BinaryWriter]::new($output)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$sizes.Count)
        $offset = [uint32](6 + 16 * $sizes.Count)
        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$images[$i].Length)
            $writer.Write($offset)
            $offset += [uint32]$images[$i].Length
        }
        foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
        $writer.Flush()
        [IO.File]::WriteAllBytes((Join-Path $publicDir 'favicon.ico'), $output.ToArray())
    } finally {
        $writer.Dispose()
        $output.Dispose()
    }
} finally {
    $source.Dispose()
}
