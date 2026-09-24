# ¿Toca código un PR? (docs/trabajo-en-paralelo.md §9.2, DEC-100). Se carga con `source`.
#
# Lee la lista de archivos cambiados por la entrada y escribe `true` o `false`:
#
#   git diff --name-only "origin/$BASE...HEAD" | hay_codigo
#
# Es documentación todo lo que está bajo docs/ y los *.md fuera de src/. Basta un archivo que no lo
# sea para que haya código. Una lista vacía cuenta como código: sin nada que juzgar, se prueba todo.
hay_codigo() {
  awk '
    NF { n++ }
    NF && !(/^docs\// || (/\.md$/ && !/^src\//)) { codigo = 1 }
    END { print (codigo || !n) ? "true" : "false" }
  '
}
