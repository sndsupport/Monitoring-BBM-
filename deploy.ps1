# Run the following commands to verify, commit, and deploy the changes

# 1. Verify parsing
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
$c2 = Get-Content -Raw "src\Index.html"; $m2 = [regex]::Matches($c2, '(?s)<script[^>]*>(.*?)</script>'); $i=0; foreach($x in $m2){ $i++; $t2="$env:TEMP\idx_$i.js"; Set-Content -Path $t2 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t2; if($?){ "Index.html #$i OK" } }
$c3 = Get-Content -Raw "src\JalurScript.html"; $m3 = [regex]::Matches($c3, '(?s)<script[^>]*>(.*?)</script>'); $t3 = "$env:TEMP\jalur_chk.js"; Set-Content -Path $t3 -Value $m3[0].Groups[1].Value -Encoding UTF8; node --check $t3; if($?){ "JalurScript OK" }
$c4 = Get-Content -Raw "src\JalurPages.html"; $m4 = [regex]::Matches($c4, '(?s)<script[^>]*>(.*?)</script>'); foreach($x in $m4){ $t4="$env:TEMP\jp_chk.js"; Set-Content -Path $t4 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t4; if($?){ "JalurPages inline OK" } }

# 2. Git commit and push
git add src/Index.html src/js.html src/JalurPages.html src/JalurScript.html README.md
git commit -m "feat: add autocomplete driver dropdown"
git push

# 3. Deploy
clasp push -f
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "Deploy Autocomplete Driver"
