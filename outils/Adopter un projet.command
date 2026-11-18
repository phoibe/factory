#!/bin/bash
# Double-cliquez ce fichier sur votre Mac : il met dans la factory un projet que vous avez déjà commencé.
# Il lance toujours la dernière version du script de la factory (scripts/factory.sh), qui vous pose ses questions.
cd "$HOME" || exit 1
clear
script=$(mktemp) || exit 1
if curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/factory.sh -o "$script"; then
  bash "$script" adopter
  status=$?
  echo
  if [ "$status" -eq 0 ]; then
    printf "C'est fini. Appuyez sur une touche pour fermer cette fenêtre."
  else
    printf "Ça n'a pas abouti : lisez le message ci-dessus, puis appuyez sur une touche pour fermer cette fenêtre."
  fi
  read -r -n 1 </dev/tty
else
  echo
  echo "Impossible de télécharger la factory. Vérifiez votre connexion à internet, puis relancez ce fichier."
  read -r -n 1 -p "Appuyez sur une touche pour fermer cette fenêtre." </dev/tty
fi
rm -f "$script"
echo
