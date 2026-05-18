# Run BA Context Seed against local Neo4j (Transcrib)
# Usage: .\run-ba-context-seed.ps1
#
# Requires: cypher-shell in PATH, or adjust $CYPHER_SHELL to the full path.
# Connection: bolt://localhost:3587, credentials: neo4j / neo4j_graph_dev

$CYPHER_SHELL = "cypher-shell"
$BOLT_URI     = "bolt://localhost:3587"
$USER         = "neo4j"
$PASS         = "neo4j_graph_dev"
$SEED_FILE    = "$PSScriptRoot\ba-context-seed.cypher"

Write-Host "Running BA Context seed against $BOLT_URI ..."

Get-Content $SEED_FILE |
  Where-Object { $_ -notmatch '^\s*//' -and $_ -notmatch '^\s*$' } |
  ForEach-Object { $_ } |
  & $CYPHER_SHELL -a $BOLT_URI -u $USER -p $PASS --format plain

Write-Host "Done."
