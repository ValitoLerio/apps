#!/bin/sh
# Sube la version de TODAS las apps y de version.txt a la vez.
# Tienen que ir siempre juntas: cada html se compara con version.txt, y si
# una se queda atras cree para siempre que hay version nueva y saca el
# cartel de actualizar sin parar. Usar esto y no sed a mano.
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
sed -i "s/?v=[0-9]*/?v=$V/g" *.html
printf '%s' "$V" > version.txt
echo "$V"
