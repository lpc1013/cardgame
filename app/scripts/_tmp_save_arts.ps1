Add-Type -AssemblyName System.Drawing
$pairs = @(
  @("end_fuma_end_a_deep_1787564085.png", "end_fuma_end_a_deep.jpg"),
  @("end_qiuwei_end_buried_1787564085.png", "end_qiuwei_end_buried.jpg"),
  @("end_qiuwei_end_supplement_1787564143.png", "end_qiuwei_end_supplement.jpg"),
  @("end_qiuwei_end_bailin_1787564143.png", "end_qiuwei_end_bailin.jpg")
)
$srcDir = "C:\Users\Pengcheng_Li\.qoder-cn\vibe_images"
$dstDir = "e:\CardGame\app\src\assets\endings"
foreach ($p in $pairs) {
  $src = Join-Path $srcDir $p[0]
  $dst = Join-Path $dstDir $p[1]
  $img = [System.Drawing.Image]::FromFile($src)
  $img.Save($dst, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $img.Dispose()
  Write-Output ("OK " + $p[1])
}
