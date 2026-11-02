# Met à jour extensions.json (extensions françaises de TCGdex, sans les sets numériques Pocket).
# À lancer quand de nouvelles extensions sortent :  pwsh scripts\maj-extensions.ps1  puis git add/commit/push.
$dir = Split-Path $PSScriptRoot -Parent
$sets = Invoke-RestMethod "https://api.tcgdex.net/v2/fr/sets"
$res = $sets | ForEach-Object -ThrottleLimit 12 -Parallel {
  try {
    $d = Invoke-RestMethod "https://api.tcgdex.net/v2/fr/sets/$($_.id)"
    [pscustomobject]@{ id=$d.id; nom=$d.name; code=$d.abbreviation.official; date=$d.releaseDate; serie=$d.serie.name; officiel=$d.cardCount.official; total=$d.cardCount.total; logo=$_.logo }
  } catch { $null }
}
$res = $res | ? { $_ -and ($_.serie -notmatch 'Pocket') } | Sort-Object @{e={ if($_.date){$_.date}else{'0000'} }} -Descending
$res | ConvertTo-Json -Depth 3 | Set-Content "$dir\extensions.json" -Encoding utf8
"$($res.Count) extensions écrites dans extensions.json"
