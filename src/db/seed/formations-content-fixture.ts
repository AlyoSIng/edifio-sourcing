// =====================================================================
// formations-content-fixture.ts — Contenu intégré des 4 guides de formation
// Produit par Cowork (CMO Léa) le 2026-05-29.
// Destination repo : src/db/seed/formations-content-fixture.ts
// Réf : handoff/RESPONSE_260529_FORMATIONS_GUIDES_INTEGRES.md
//
// Important : contenu intégré dans la BDD (champ content_md), rendu inline
// dans l'app. Pas d'URL externe. La page utilisateur est servie à
// `/sourcing/profil/formations/<slug>` et charge le markdown depuis BDD.
// =====================================================================

export type FormationSeed = {
  id: string; // UUID déterministe pour idempotence seed
  slug: string; // identifiant URL stable
  title: string;
  description: string;
  type: "doc"; // contenu écrit intégré
  durationMin: number; // durée de lecture estimée
  contentMd: string; // corps du guide en markdown
  isActive: boolean;
  displayOrder: number;
};

const GUIDE_1 = `Bienvenue dans edifio Sourcing. En une dizaine de minutes, tu vas comprendre à quoi sert l'outil, où trouver tes appels d'offres, et comment ouvrir ton premier dossier.

## 1. Tu te connectes
Rends-toi sur l'URL de l'application avec ton adresse \`@alyosingenierie.fr\` et ton mot de passe. À ta toute première connexion, l'outil te demande de remplacer le mot de passe provisoire — choisis-en un long (au moins 16 caractères), avec une majuscule, une minuscule, un chiffre et un symbole. Une passphrase comme « marche-rapide-soleil-42! » fait très bien l'affaire.

## 2. Trois zones du menu, trois usages
Une fois connecté, tu repères trois zones : **AO du jour** (ta file de travail quotidienne), **Contacts** (annuaires Architectes, Bureaux d'Études, Entreprises / Majors), et **Mon profil** (formations, FAQ, support, actualités produit). C'est tout ce dont tu as besoin pour commencer.

## 3. À quoi sert edifio Sourcing
L'outil détecte chaque matin les appels d'offres publics du BTP qui correspondent à AlyoS, te propose un score de pertinence, et t'aide à monter le dossier — en **Mandataire** (seul), en **Cotraitance** avec un architecte, ou en **Conception-Réalisation** (groupement maîtrise d'œuvre + réalisateur).

## 4. D'où viennent les annonces
Sources connectées : **BOAMP**, **PLACE**, **Francmarchés**, et d'autres plateformes complémentaires. La collecte tourne automatiquement chaque jour ouvré à **6 h 30 (heure de Paris)**. Tu n'as rien à lancer.

## 5. Ta file « AO du jour »
Ouvre la page **AO du jour**. Tu vois les annonces non traitées, triées par score. Les annonces des jours précédents qui n'ont pas encore été décidées restent visibles : rien ne se perd. Tu peux trier et filtrer par **département** et par **jours avant clôture** pour prioriser les marchés proches ou les plus urgents.

## 6. Ton profil de recherche
Ce qu'edifio détecte dépend du profil actif : mots-clés métier, CPV, géographie, types de marché. Tu peux consulter ces critères dans **Admin > Profils de recherche**. Si la file ne correspond pas à ce que tu attends, c'est généralement le profil qu'il faut ajuster, pas le tri.

## 7. Ouvrir ton premier appel d'offres
Clique sur une carte. L'écran de résultat te donne, en haut : le **maître d'ouvrage**, l'**objet du marché**, la **date de clôture**. Plus bas : les boutons **Voir l'annonce** (source officielle) et **Télécharger le DCE** (dossier de consultation).

## 8. Le brief d'opportunité
Sur la même page, tu trouves un bouton **Générer le brief**. En trois à quatre lignes, l'outil te résume l'objet, les lots clés, et un signal d'adéquation avec AlyoS. Si une information manque dans l'annonce, le brief le dit explicitement — il n'invente pas.

## 9. Et après ?
Tu décides : tu traites le dossier (Mandataire / Cotraitance / Conception-Réalisation), tu reportes l'AO à plus tard, ou tu l'écartes. Les guides suivants te montrent comment.`;

const GUIDE_2 = `Une fois ton profil de recherche bien réglé, l'enjeu quotidien est simple : passer la file et prendre une décision sur chaque annonce. Ce guide te donne la routine.

## 1. Trois statuts pour un AO traité
Un appel d'offres a trois sorties possibles :
- **Sélectionné** — tu le traites (Mandataire, Cotraitance ou Conception-Réalisation). Il bascule en pipeline.
- **Reporté** — tu n'es pas prêt à décider. Tu le mets de côté pour 1, 3 ou 7 jours ; il réapparaîtra automatiquement.
- **Écarté** — tu décides qu'il n'est pas pour AlyoS. L'action est tracée, l'annonce reste en base, rien n'est perdu.

## 2. Reporter un appel d'offres
Sur la carte de l'AO, le bouton **Reporter** ouvre un petit menu avec trois raccourcis : **+1 jour**, **+3 jours**, **+7 jours**. Choisis, et l'annonce disparaît de ta file. À l'échéance, elle revient en haut de la liste. Cet usage est précieux quand tu attends une information (le DCE qui sera publié dans 48 h, un retour d'un MOA, etc.).

## 3. Écarter un appel d'offres
Le bouton **Écarter** ouvre une fenêtre où tu indiques rapidement la raison (hors zone, hors compétence, montant trop bas…). L'AO sort de ta file mais reste consultable dans l'historique : si tu changes d'avis, rien n'est définitif.

## 4. Lire le brief d'opportunité
Avant de trancher, prends 30 secondes pour ouvrir l'AO et générer le brief IA. Il te donne l'objet, les lots et le signal d'adéquation AlyoS. C'est souvent suffisant pour décider.

## 5. Identifier la procédure
Dans l'annonce officielle (bouton **Voir l'annonce**), repère le **type de procédure** :
- **AO ouvert** — tout le monde peut candidater jusqu'à la date limite.
- **MAPA** (procédure adaptée) — marché en dessous des seuils européens, plus souple, mais souvent rapide.
- **Restreint** — il faut d'abord candidater (phase candidature) puis être retenu pour remettre une offre.

Cette information conditionne le rythme et les pièces à préparer.

## 6. Naviguer entre profils de recherche
Si tu travailles avec plusieurs profils (par exemple un profil « toutes régions » et un profil « Île-de-France »), tu peux basculer depuis la page **AO du jour**. Tu verras des files différentes — c'est normal et utile pour adapter ton focus.

## 7. La routine du matin
La meilleure pratique tient en trois étapes :
1. Tu ouvres **AO du jour** entre 9 h et 10 h.
2. Tu passes la file du haut vers le bas, en t'aidant du score.
3. Tu décides sur chaque annonce : **Sélectionner / Reporter / Écarter**. Pas de « à voir plus tard » sans bouton — soit tu reportes formellement, soit tu écartes.

En quelques jours, ta file devient courte et pertinente.`;

const GUIDE_3 = `Quand un appel d'offres exige une maîtrise d'œuvre (rénovation, restructuration, marché global), AlyoS répond en **Cotraitance** avec un architecte. edifio te guide pour identifier le bon partenaire et lancer la sollicitation.

## 1. Activer la Cotraitance sur un AO
Sur l'écran de résultat d'un appel d'offres, choisis **Cotraitance** dans le sélecteur de configuration de réponse. L'outil ouvre la **shortlist** des architectes les plus pertinents.

## 2. Comprendre la shortlist
La shortlist combine plusieurs critères :
- **Proximité géographique** — un architecte situé dans le **même département** que le lieu d'exécution est largement priorisé, puis les **départements limitrophes**.
- **Taille du cabinet** — les structures suffisamment armées sont mises en avant, sans exclure les cabinets plus petits si leur score global est élevé.
- **Spécialité** — adéquation entre le marché (ERP, logement, scolaire…) et l'expertise du cabinet.
- **Historique avec AlyoS** — un partenaire avec qui tu as déjà collaboré remonte naturellement.

Tu obtiens ainsi une liste courte et pertinente, pas un annuaire à éplucher.

## 3. Le rôle d'AlyoS dans le tandem
Dans la majorité des cas, AlyoS est **mandataire** du groupement : tu pilotes la candidature, tu coordonnes le cotraitant, tu portes la réponse. L'architecte est associé pour la part de maîtrise d'œuvre. Ce positionnement t'engage à fournir l'animation, le calendrier et le mémoire technique.

## 4. Lire la fiche d'un architecte
Clique sur un nom de la shortlist. La fiche affiche : spécialité, localisation, candidatures passées (avec AlyoS et au-delà), et — si renseignées — son effectif, son chiffre d'affaires et son adresse. C'est suffisant pour savoir si tu veux le solliciter.

## 5. Envoyer une sollicitation
Le bouton **Solliciter** ouvre un aperçu de l'e-mail qui sera envoyé : objet de l'AO, date limite, lien vers la fiche tokenisée pour répondre, mention RGPD et lien d'opposition. Vérifie la civilité (tu / vous est piloté par la fiche architecte), puis envoie. L'architecte reçoit immédiatement.

## 6. La relance automatique à J+3
Si l'architecte n'a pas répondu **trois jours** après ta sollicitation, edifio envoie automatiquement une relance courte. Tu n'as rien à faire — c'est tracé, idempotent (jamais deux fois), et l'architecte peut toujours répondre ou s'opposer.

## 7. Si l'architecte décline
Quand un architecte refuse, l'AO passe en statut **Architecte décliné**. Tu retournes alors à la shortlist pour solliciter le suivant. Pas de drame : c'est le quotidien. Réagis vite tant que la date de clôture le permet.

## 8. Suivre tes dossiers Cotraitance
Le tableau de bord Cotraitance liste tes dossiers en attente, avec la date limite et le délai restant. Tu vois immédiatement où concentrer ton énergie.`;

const GUIDE_4 = `Pour candidater rapidement, tu dois pouvoir réutiliser tes pièces administratives sans les rechercher. edifio centralise tout dans la **Bibliothèque entreprise**.

## 1. La Bibliothèque entreprise, ton coffre
Accède à **Admin > Bibliothèque entreprise**. Tu y déposes une fois chaque pièce, et edifio les met à disposition pour toutes tes candidatures, en Mandataire comme en Cotraitance.

## 2. Les 14 catégories
La bibliothèque organise tes documents en 14 catégories, parmi lesquelles : **DC1**, **DC2**, **DC4**, **Pouvoir**, **Kbis**, **Attestation d'assurance**, **Attestation URSSAF**, **Attestation fiscale**, **Présentation du BE**, **Moyens humains et matériels**, **Références**, **Mémoire RSE**… Tu choisis la bonne catégorie au moment du dépôt.

## 3. Charger ton URSSAF et ton Kbis
Commence par les deux pièces les plus demandées : l'**attestation URSSAF de vigilance** (à renouveler tous les six mois) et le **Kbis** (idéalement de moins de trois mois). Dépose le PDF, renseigne la **date d'expiration**, valide. Le document est immédiatement disponible pour les candidatures.

## 4. Le rôle particulier du DC2
Le **DC2** est la *Déclaration du candidat individuel ou membre d'un groupement*. C'est la pièce qui prouve que tu as les capacités économiques et professionnelles pour exécuter le marché. Tiens un DC2 à jour dans la bibliothèque : tu le réutiliseras à chaque candidature, et tu le mettras à jour annuellement.

## 5. Réutiliser sans ressaisir
À la constitution d'un dossier, edifio puise dans la bibliothèque : tu ne télécharges plus les mêmes pièces à chaque fois. Si un acheteur exige une pièce datée d'un mois maximum (par exemple le Kbis), l'outil te signale si ta version est trop ancienne.

## 6. Être alerté avant expiration
Chaque pièce affiche un **badge de validité** : **vert** (à jour), **orange** (expire dans moins de 30 jours), **rouge** (expiré). Tu n'as plus besoin de surveiller toi-même — passe régulièrement et remplace ce qui est orange ou rouge.

## 7. L'annuaire des architectes et leurs pièces
Côté **Contacts > Architectes**, les cabinets partenaires disposent du même coffre : leurs propres pièces administratives et leurs dates d'expiration. Quand tu sollicites un architecte en Cotraitance, tu vois immédiatement si sa documentation est exploitable.

## 8. Tes priorités pour bien démarrer
Si tu commences avec edifio Sourcing, charge en premier ces cinq pièces : **Kbis**, **Attestation URSSAF**, **Attestation fiscale**, **Attestation d'assurance**, **DC2**. Avec ça, tu peux candidater à 90 % des appels d'offres dès demain.`;

const GUIDE_5 = `Tous les appels d'offres ne se répondent pas de la même façon. edifio Sourcing distingue trois modes de réponse, et chacun change la composition du dossier, le signataire et le rôle d'AlyoS dans le groupement.

## 1. Pourquoi trois modes
La réalité du marché impose ces trois configurations : parfois tu réponds **seul** (mission technique pure), parfois tu as besoin d'un **architecte** pour porter la maîtrise d'œuvre, parfois tu pilotes un **groupement de bureaux d'études** sur un marché multi-techniques. L'outil colle à cette réalité plutôt que d'imposer un format unique.

## 2. Mode Mandataire (Solo)
Tu réponds **seul** au nom d'AlyoS Ingénierie. C'est le mode par défaut quand le marché est purement technique : missions BE structure, fluides, thermique, ingénierie d'exploitation. Le DC1 et le DC2 sont remplis au seul nom d'AlyoS. Le signataire est un dirigeant AlyoS, ou le bénéficiaire d'un Pouvoir interne. Le dossier ne contient que tes pièces.

## 3. Mode Cotraitance Tandem
Tu réponds **avec un architecte** qui devient **mandataire** du groupement. AlyoS est cotraitant pour la part ingénierie. Ce mode s'impose dès qu'un volet maîtrise d'œuvre architecture est demandé (rénovation, restructuration, marché global). Le dossier contient un DC1 commun, un DC2 par membre, un Pouvoir pour l'architecte mandataire. C'est lui qui signe et dépose.

## 4. Mode Cotraitance BE
Tu pilotes un **groupement de bureaux d'études** : AlyoS est mandataire, d'autres BE sont cotraitants (acoustique, environnement, économiste…). Ce mode s'impose sur les marchés multi-techniques où aucun BE seul n'a toutes les compétences. Le dossier contient un DC1 commun, un DC2 par BE, un Pouvoir pour AlyoS. C'est toi qui signes.

## 5. Choisir le bon mode
Trois critères suffisent :
- **Y a-t-il une mission architecture ?** Oui → Tandem. Non → Solo ou Cotraitance BE.
- **Le marché dépasse-t-il tes compétences seules ?** Oui → Cotraitance BE pour fédérer des partenaires. Non → Solo.
- **Tes partenaires sont-ils disponibles** sur le calendrier ? Sinon, c'est l'arbitrage entre passer son tour ou répondre Solo en réduisant le périmètre.

## 6. Le statut de l'AO se met à jour
Dès que tu sélectionnes un mode, le statut de l'AO bascule : **Solo confirmé**, **Tandem en cours** ou **Cotraitance BE en cours**. Le tableau de bord reflète ce choix, et les guides de la candidature s'adaptent.

## 7. Ce que change le mode pour la suite
Le mode pilote tout l'aval :
- **DC1 / DC2** : un par membre du groupement.
- **Pouvoir** : généré pour le mandataire (toi en Solo et Cotraitance BE, l'architecte en Tandem).
- **ZIP final** : contient les pièces de chaque membre, et son nom inclut le cabinet ou le BE concerné.
- **Diffusion** : en Tandem, le dossier part par mail à l'architecte mandataire avant dépôt.`;

const GUIDE_6 = `Le règlement de la consultation (RC) est la pièce maîtresse de tout appel d'offres. edifio Sourcing l'analyse pour toi avec Claude et cale automatiquement les pièces de ta bibliothèque sur ce que l'acheteur demande.

## 1. Le RC, ta source de vérité
Le RC liste les pièces à fournir, les critères de jugement, les échéances, les conditions de signature. Tant que tu n'as pas le RC, tu ne peux pas réellement préparer la candidature. **Commence toujours par lui** avant tout autre document du DCE.

## 2. Importer le RC
Trois moyens te sont offerts :
- **Auto-détection** : si le RC est identifiable dans le DCE téléchargé depuis la source officielle, l'outil le récupère seul.
- **Paste URL** : tu colles l'URL directe du PDF, l'outil le télécharge.
- **Upload manuel** : tu glisses le PDF depuis ton disque (taille max **32 Mo**).

## 3. L'aperçu PDF intégré
Une fois importé, le RC s'affiche dans un **aperçu PDF intégré** à la page. Tu navigues page par page sans quitter edifio, ce qui évite les allers-retours avec ton lecteur PDF système.

## 4. Lancer l'analyse IA
Le bouton **Analyser le RC** déclenche une analyse Claude. **Sonnet** lit le document et structure les informations, **Haiku** vérifie la cohérence des extractions. La durée typique est de **30 à 90 secondes** pour un RC standard de 20 à 40 pages.

## 5. Ce que l'analyse extrait
Quatre familles d'information :
- **Pièces demandées** — liste exhaustive (Kbis, DC1, DC2, attestations, références, mémoire technique…).
- **Critères** — pondération technique / prix, sous-critères.
- **Échéances** — date limite de remise, durée de validité des offres, début prévisionnel d'exécution.
- **Alertes** — clauses inhabituelles (caution, exigence d'effectif, géographie imposée).

Chaque champ extrait référence **sa page d'origine** et inclut une **citation courte** : tu peux toujours vérifier.

## 6. Le matching automatique avec ta bibliothèque
Pour chaque pièce demandée, edifio cherche dans ta **Bibliothèque entreprise** la version correspondante. Quand c'est trouvé, la pièce est cochée et liée. Sinon, elle apparaît en **« à fournir »** et tu sais immédiatement ce qu'il te manque.

## 7. Que faire des pièces non couvertes
Trois options :
- **Ajouter à la bibliothèque** si c'est une pièce générique que tu réutiliseras (mémoire RSE, attestation assurance renouvelée…).
- **Charger en pièce ponctuelle** si c'est spécifique à cet AO (référence ciblée, planning sur mesure).
- **Recompiler le dossier** une fois les pièces ajoutées, pour que le ZIP final reflète l'état réel.

## 8. Si l'analyse échoue
Trois causes fréquentes :
- **PDF non valide** — image scannée non OCRisée, fichier corrompu. Re-télécharge depuis la source.
- **Polices non standard** — certains RC bloquent l'extraction. Convertis le PDF via un export propre.
- **Taille au-delà de 32 Mo** — découpe ou compresse le fichier avant import.

Dans tous les cas, l'erreur est tracée et tu peux relancer.`;

const GUIDE_7 = `Une fois le RC analysé et tes pièces matchées, il te reste à produire les trois documents administratifs et à compiler le ZIP final. edifio génère tout, tu n'as plus qu'à vérifier et signer.

## 1. Les trois documents administratifs
La candidature s'appuie sur trois CERFA et un acte de Pouvoir :
- **DC1** — *Lettre de candidature et désignation du mandataire* (un seul pour tout le groupement).
- **DC2** — *Déclaration du candidat* (un par membre du groupement).
- **Pouvoir** — délégation de signature du mandataire au signataire effectif.

Selon le mode (Solo, Tandem, Cotraitance BE), le périmètre change : qui fournit quoi, qui signe quoi.

## 2. Pré-remplissage automatique selon le mode
edifio puise dans ta bibliothèque et dans la fiche de chaque cotraitant pour remplir les champs : raison sociale, SIRET, adresse, capital, effectifs, dirigeants. Tu n'as à ressaisir aucune information de base. La génération utilise **pdf-lib** pour produire des PDF natifs téléchargeables.

## 3. En Tandem : un dossier par architecte accepté
Quand tu lances la cotraitance Tandem, tu sollicites souvent **plusieurs architectes** pour maximiser tes chances. Quand deux ou trois acceptent, edifio génère **un dossier par architecte** : chaque dossier a son propre DC1 (avec l'architecte en mandataire) et son Pouvoir nominatif. Tu choisis ensuite avec qui tu pars en final.

## 4. En Cotraitance BE : un DC2 par bureau d'études
Le DC1 reste unique (tu es mandataire), mais **chaque BE cotraitant doit fournir son DC2**. edifio génère les DC2 pré-remplis depuis les fiches BE et te signale ceux qui restent à compléter (signataire, lieu, date).

## 5. Compléter les champs « À compléter »
Quelques champs ne peuvent pas être pré-remplis sans confirmation :
- **Signataire** — nom et qualité de la personne physique qui signe.
- **Lieu** — ville de signature (souvent ton siège).
- **Date** — date de remise prévisionnelle ou date du jour.

Ils sont signalés visuellement avant la génération du PDF.

## 6. Le PDF généré
Chaque document généré est un **PDF natif** (pas un scan), correctement paginé, avec les cases CERFA cochées. Tu cliques sur **Télécharger** pour récupérer le fichier seul, ou tu passes directement à la compilation du ZIP final.

## 7. Le Pouvoir : ton template docx de la bibliothèque
Le Pouvoir n'est pas un CERFA mais un acte interne. edifio puise dans ta bibliothèque, **catégorie pouvoir_mandataire**, le template docx que tu as déposé une fois pour toutes. Il est complété avec le mandant, le mandataire, l'objet et la portée du pouvoir, puis converti en PDF.

## 8. Compiler le ZIP final
Le bouton **Compiler le ZIP** assemble : **RC**, **DC1**, **DC2** (un par membre), **Pouvoir**, et les **pièces communes** issues de la bibliothèque (Kbis, attestations, références…). Tout est rangé dans une arborescence claire que l'acheteur comprend immédiatement.

## 9. Le nom du ZIP est contextualisé
Le nom du fichier inclut le **cabinet d'architecte** (en Tandem) ou le **BE concerné** (en Cotraitance BE), plus la référence de l'AO. Tu repères tout de suite quel ZIP correspond à quelle configuration quand tu en as plusieurs en parallèle.`;

const GUIDE_8 = `Quand un architecte accepte ta sollicitation Tandem, le dossier passe en phase de **diffusion**. C'est le moment où tu valides le contenu et tu transmets formellement le ZIP à l'architecte qui déposera la candidature en tant que mandataire.

## 1. L'architecte accepte, le statut bascule
Quand un architecte clique sur **Accepter** depuis la fiche tokenisée envoyée en sollicitation, le statut de l'AO bascule à **architect_accepted**. Tu reçois une notification dans edifio, et le tableau de bord Tandem affiche le dossier comme prêt à être finalisé.

## 2. La section « Dossier prêt »
Sur la page short-list de l'AO, une nouvelle section apparaît : **Dossier prêt**. Elle regroupe le ZIP compilé pour l'architecte concerné, la liste des pièces incluses, et le bouton de diffusion. Si plusieurs architectes ont accepté, chaque dossier prêt apparaît dans sa propre carte.

## 3. Vérifier les documents du DCE
Avant de diffuser, prends le temps de revérifier les pièces du DCE côté acheteur : RC, AE, CCAP, CCTP, BPU. L'architecte les recevra **en pièces jointes ou en lien** dans le mail, et il aura besoin d'eux pour finaliser sa partie. Si une pièce du DCE manque, ajoute-la depuis l'onglet **Pièces du marché**.

## 4. Vérifier les pièces du dossier
Côté ton dossier compilé : ouvre le ZIP, vérifie que le DC1 désigne bien l'architecte mandataire, que ton DC2 AlyoS est à jour, que le Pouvoir est nominatif, et que les attestations URSSAF / fiscale ne sont pas expirées. Une minute de relecture évite un rejet administratif.

## 5. Le bouton « Valider et envoyer le dossier »
Le bouton **Valider et envoyer le dossier** est l'action irréversible de cette étape. Avant de cliquer, une fenêtre de confirmation récapitule ce qui part : à qui (l'architecte mandataire), avec quel ZIP, et avec quels documents DCE en lien. Tu confirmes, l'envoi part immédiatement.

## 6. Le mail Brevo envoyé à l'architecte
Le mail s'appuie sur le template Brevo **architect_dossier_diffusion**. Il contient :
- L'objet du marché et la date limite de remise.
- Un lien vers la page dossier dans edifio.
- Le ZIP compilé en pièce jointe (ou lien sécurisé si le ZIP dépasse 10 Mo).
- Le contact AlyoS référent (toi).

La civilité **tu / vous** suit la préférence de la fiche architecte.

## 7. Le lien vers la page dossier
Le mail contient un lien tokenisé vers la **page dossier**. L'architecte peut y consulter les pièces, télécharger le ZIP à nouveau s'il le perd, et te signaler une anomalie. Le lien est valide jusqu'à la date de remise.

## 8. Une fois envoyé, le statut bascule à dossier_diffused
Côté edifio, le statut de l'AO bascule à **dossier_diffused**. Le tableau de bord Tandem range ce dossier dans la colonne **Diffusés**, en attente de la signature et du dépôt par l'architecte. Tu peux suivre la suite depuis cette colonne.

## 9. Et ensuite
Une fois la candidature acceptée par l'acheteur, la phase d'offre commence : **mémoire technique** et **acte d'engagement**. Cette phase fait l'objet d'un autre guide et d'un autre rythme — généralement deux à quatre semaines de travail après la candidature.`;

const GUIDE_9 = `La bibliothèque entreprise est le poste central de tes pièces réutilisables : Kbis, attestations URSSAF / fiscale / RC pro, références, présentation société, RIB, déclarations sur l'honneur, etc. Bien tenue, elle alimente automatiquement tes dossiers de candidature.

## 1. Pourquoi indexer la bibliothèque
Sans indexation, edifio fait le matching pièces RC ↔ biblio sur le seul nom de fichier. Si tu uploades \`Scan001.pdf\` ou \`DOC_2026_v1.pdf\`, le moteur ne reconnaît rien. Une fois indexé par Claude, chaque doc a un **titre intelligent**, des **mots-clés**, un **résumé** et un **type canonique** — le matching devient vraiment précis.

## 2. Lancer l'indexation
Sur \`/sourcing/admin/bibliotheque\`, le bandeau **🤖 Indexation IA** propose le bouton **« Indexer la bibliothèque »**. Au clic, Claude Haiku 4.5 traite jusqu'à 15 documents par lot (limite Vercel 60 s). Si tu en as plus, le résumé t'indiquera « X restants — relancez pour continuer ». Recliquez jusqu'à 0 restant.

## 3. Lire ce que Claude a compris
Chaque item indexé affiche un badge **✓ Indexé ▾** vert à côté de son nom. Au clic, un panneau dépliable montre :
- **Titre IA** : la description courte que Claude a extraite (souvent meilleure que ton nom de fichier).
- **Type détecté** : code canonique parmi 24 valeurs (urssaf, kbis, references…).
- **Résumé** : 1-2 phrases en italique.
- **Mots-clés** : chips réutilisés pour le matching.
- **Entités structurées** : SIRET, dates, montants si détectés.

## 4. Ré-indexer un seul item
À côté du bouton **Supprimer**, le bouton **🤖 Ré-indexer** force une nouvelle analyse Claude pour ce doc, en bypassant le cache hash. Utile si Claude avait mal compris la première fois, ou si tu veux retester après un changement de prompt.

## 5. L'avertissement « ⚠️ Index obsolète »
Si tu ré-uploades un document sans relancer l'indexation, le badge vert se transforme en **⚠️ Index obsolète** orange. edifio détecte que la dernière indexation est antérieure à la date de modification du fichier. Un clic sur **🤖 Ré-indexer** rafraîchit tout.

## 6. Coût de l'indexation
Chaque indexation Claude coûte ~2-3 c€. Pour une bibliothèque de 30 docs : ~75 c€ par run complet. Le \`source_hash\` SHA-256 évite les ré-indexations inutiles : si tu cliques sur **Indexer la bibliothèque** sans avoir rien ré-uploadé, tous les items sont marqués \`skipped\` et l'API Claude n'est pas appelée.

## 7. Audit et traçabilité
Chaque run Claude est enregistré dans \`ai_runs\` (modèle, tokens entrée/sortie, coût USD, latence ms, JSON de sortie). Tu peux retracer le coût total de l'indexation IA mois par mois côté Supabase. La table \`library_item_index\` garde le \`ai_run_id\` lié pour chaque doc.`;

const GUIDE_10 = `Les attestations URSSAF, fiscale et RC pro ont des dates de validité courtes (généralement 6 à 12 mois). Si tu envoies un dossier avec une attestation périmée, c'est un rejet administratif quasi-systématique. edifio surveille pour toi.

## 1. Renseigner la date de validité
Sur \`/sourcing/admin/bibliotheque\`, chaque catégorie qui a \`hasExpiry: true\` (URSSAF, attestation fiscale, assurance RC, Kbis) expose un champ **Valide jusqu'au** dans le formulaire d'upload. Renseigne-le systématiquement, c'est la base de toutes les alertes.

## 2. Les badges visuels
À côté du nom de chaque item dans la biblio, edifio affiche un badge :
- **Expiré** (rouge) — la date est dépassée
- **J−7** (rouge) — moins d'une semaine
- **J−30** (orange) — entre une semaine et un mois
- **Date** (vert) — au-delà d'un mois

## 3. Avertissements dans le flow dossier
Avant de cliquer **Compiler le dossier** sur la page Pièces, edifio affiche deux bandeaux si nécessaire :
- **Rouge** : « X documents expirés — exclus du ZIP ». La liste des docs concernés s'affiche avec un lien direct vers la bibliothèque pour renouveler.
- **Orange** : « X documents expirent dans les 30 jours — inclus dans le ZIP mais à surveiller ». Encore inclus dans le ZIP final, mais visuellement signalés.

## 4. Le mail digest hebdo
Tous les lundis matin (7 h Paris), un cron Vercel parcourt ta bibliothèque et envoie un mail digest aux admins et superadmins de ton organisation. Le mail liste les docs expirés (à renouveler en priorité) et les docs qui expirent dans les 30 jours (à surveiller). Si rien à signaler, aucun mail n'est envoyé — pas de bruit inutile.

## 5. Mettre à jour une attestation
Quand tu reçois une nouvelle attestation URSSAF, tu peux soit :
- **Re-uploader** depuis la biblio (le doc remplace l'ancien et reset la date)
- **Supprimer** l'ancien et **uploader** le nouveau

Dans les deux cas, pense à mettre à jour la **date de validité** dans le formulaire. Sans ça, edifio ne saura pas que le doc est à nouveau valide.

## 6. Bon réflexe : indexer après chaque ré-upload
Si tu as activé l'indexation IA, ré-uploader un doc invalide l'index existant (badge **⚠️ Index obsolète**). Pense à cliquer **🤖 Ré-indexer** pour que Claude re-lise le nouveau doc et mette à jour les mots-clés / dates extraites.`;

const GUIDE_11 = `Le tableau Excel **Veille_AO_DD_MM_YYYY.xlsx** est le format de référence pour tracer ton activité commerciale en parallèle d'edifio. Pour t'éviter de re-saisir, edifio exporte automatiquement tous les AO du jour au bon format.

## 1. Où trouver le bouton
Sur \`/sourcing/ao-du-jour\`, à droite des filtres et des actions admin, le bouton **📥 Export Excel (CSV)** est visible pour tous les admins. Au clic, edifio compile en quelques secondes un fichier \`Veille_AO_DD_MM_YYYY_NAO.csv\`.

## 2. Format du fichier
Le fichier généré est un **CSV avec séparateur \`;\`** et un **BOM UTF-8** en tête. Excel français le reconnaît natif : double-clic → ouverture directe avec les bonnes colonnes et accents. Si tu utilises Excel anglais, importe via **Données → Texte/CSV → Encodage UTF-8**.

## 3. Les 38 colonnes
Le CSV reproduit exactement les colonnes de ton modèle \`Veille_AO\` : Métier, Référence AO, MOA, Intitulé, Région, Département, Ville, Date publication, Date limite, Jours restants, Montant, Type procédure, Source, URL fiche, Statut vérification URL, Public/Privé, Priorité, Notes, Architecte 1-2 et 3-5, Réponses, Commentaire, compétences (ARCHI/ECO/B/AC/RT/EL/SSI/PROTECT/PEMD/BIM/PBCVC/ADAP), Plateforme DCE.

## 4. Ce qu'edifio pré-remplit pour toi
- **#**, **Référence AO**, **MOA**, **Intitulé**, **Département**, **Date publication**, **Date limite**, **Jours restants**, **Montant**, **Type procédure**, **Source**, **URL fiche** : depuis les données BOAMP / plateformes scrapées.
- **Région** : déduite automatiquement du département via la table NOTRe 2016 (13 régions métropole + 5 DROM-COM).
- **Public/Privé** : heuristique sur le libellé MOA (CHU/CHR → Para-public, Ville/Mairie/Conseil → Public, SARL/SAS → Privé).
- **Statut vérification URL** : ✅ Vérifié si \`source_url\` non null.
- **Architecte 1/2/3-5** : depuis les \`architect_responses\` au statut **accepted**, classés par date de réponse.

## 5. Ce que tu remplis à la main
- **Métier** (selon ton profil de recherche actif), **Priorité**, **Notes**, **Réponse mandataire**, **Réponse Cotraitant**, **Commentaire**, les 12 cases de **compétences** et **Plateforme DCE**. edifio laisse ces colonnes vides — c'est ta veille à toi.

## 6. Tous profils confondus
L'export tire **tous les AO** au statut sourced de ton organisation, indépendamment du profil de recherche actif. Tu vois donc d'un coup d'œil toute la veille du jour, pas seulement le profil que tu consultes en ce moment.

## 7. Limite pratique
Pour rester rapide, l'export est plafonné à **500 lignes** par fichier. Au-delà, Excel commence à ramer et c'est probablement le signe que tes filtres BOAMP sont à resserrer.`;

const GUIDE_12 = `Quand l'usage quotidien d'edifio Sourcing monte en volume, tu as besoin de regarder ton activité de plus haut : combien d'archis tu sollicites, combien de dossiers tu envoies, combien coûte l'IA, est-ce que les crons tournent. Ce guide te montre où regarder.

## 1. Quatre dashboards admin
Dans le menu **Admin**, quatre pages te donnent une vue agrégée :
- **Activité Tandem** — tes sollicitations architectes (pending / accepté / décliné / info), taux de réponse, délai moyen.
- **Coûts IA** *(superadmin)* — dépense Claude par prompt et par mois (Haiku indexation, Sonnet RC analyse, etc.).
- **Envois de dossiers** — historique des dossiers envoyés aux architectes, actifs et annulés.
- **Crons** *(superadmin)* — exécutions des tâches planifiées (sourcing matinal, relance J+3, digest expiration biblio, cleanup ZIP).

## 2. Filtrer une période — 7 / 30 / 90 j
En haut à droite de **Activité Tandem** et **Coûts IA**, un bouton segmenté **7 j / 30 j / 90 j** te permet de zoomer. Par défaut on affiche 30 jours, qui couvre la fenêtre commerciale typique. À 7 jours, tu vois ce qui s'est passé cette semaine. À 90 jours, tu repères les tendances. La sélection passe dans l'URL (\`?range=30\`) — tu peux mettre un favori sur la fenêtre que tu utilises.

## 3. Rechercher dans les sollicitations Tandem
Sur **Activité Tandem**, le tableau des 30 dernières sollicitations propose un champ **Rechercher un cabinet ou un AO…** : tu tapes deux lettres et la liste se réduit. Pratique quand tu veux voir où en est un cabinet précis sans scroller. Le compteur t'indique combien de lignes restent visibles.

## 4. Exporter en CSV
Sur **Activité Tandem** comme sur **Envois de dossiers**, un bouton **📥 Export CSV** descend ce que tu vois à l'écran (donc respectant la recherche et le filtre statut en cours). Le format est BOM UTF-8 + séparateur \`;\` — c'est le format Excel français, double-clic ouvre nativement.

## 5. Envois de dossiers : historique complet
La page **Envois de dossiers** liste les 200 derniers ZIPs envoyés aux architectes. Pour chaque ligne tu vois : AO, archi, email destinataire, date d'envoi, statut du lien signé (Actif jusqu'à J+7 ou Expiré), statut d'envoi (Actif ou Annulé le DD/MM).
- Filtre **Tous / Actifs / Annulés** pour retrouver rapidement un envoi annulé.
- Recherche AO / archi / email pour cibler.
- Survol d'un envoi annulé : le motif que tu avais saisi au moment d'annuler apparaît en tooltip.

## 6. Annuler un envoi
Sur la page **Pièces** d'un AO, après envoi du dossier à un archi, tu vois la pastille « Envoyé le DD/MM ». Si tu t'es trompé de destinataire ou d'archi, le bouton **Annuler cet envoi** te demande un motif (optionnel mais conseillé) et marque l'envoi comme annulé.
- **Important** : le lien signé Supabase reste valide jusqu'à expiration naturelle (7 jours) — Supabase Storage ne révoque pas les signed URLs. Annuler protège ton historique et marque clairement la faute mais n'invalide pas le téléchargement. Pour un vrai blocage, il faut renommer le fichier dans Storage — pratique réservée aux fausses manipulations graves.

## 7. Notifications in-app
Quand un archi répond (acceptation, refus, demande d'infos), un badge rouge apparaît sur l'entrée **Cotraitance** de la barre latérale. Le compteur tombe à 0 quand tu ouvres la page concernée (la page Activité Tandem fait la même chose). C'est la file d'alertes Tandem.

## 8. Recherche live dans la bibliothèque
La page **Bibliothèque** (Configuration > Bibliothèque) propose un champ **Rechercher** au-dessus des 14 catégories. Il match en temps réel sur le nom du fichier, la catégorie, le titre extrait par l'IA, les mots-clés, le résumé et le type de document détecté. Insensible aux accents : « référence » trouve aussi « reference ». Pratique quand tu cherches le bon CV ou la bonne attestation à mettre dans un dossier.

## 9. Crons (superadmin)
La page **Crons** liste les 100 dernières exécutions des 4 tâches planifiées Vercel :
- **sourcing-run** (6h30 jours ouvrés) : collecte BOAMP + déclenche scraping PLACE / Francmarchés.
- **tandem-followup** (9h tous les jours) : relance J+3 des archis non-réponse.
- **library-expiry-digest** (8h chaque lundi) : email digest des attestations qui expirent.
- **dossier-zip-cleanup** (5h30 tous les jours) : supprime les ZIPs orphelins de Storage.

Chaque ligne affiche : tâche, démarré, durée, statut (OK / Erreur / En cours), aperçu de la sortie (compteurs) ou message d'erreur. C'est l'endroit où tu regardes si un cron a planté ou si rien ne s'est passé ce matin.

## 10. Quand alerter le CTO
- **Crons** : 2 erreurs consécutives sur la même tâche, ou un cron qui n'apparaît plus dans la liste depuis 24h (= il ne s'est pas déclenché du tout). **Anti-spam** : tu ne reçois pas un mail à chaque échec — si un cron rate 10 fois en 10 minutes, tu reçois 1 mail (premier échec dans la fenêtre 1h glissante), pas 10. C'est volontaire pour ne pas noyer ta boîte.
- **Activité Tandem** : taux de réponse qui chute à <30 % sur 30j (problème de templates ou de routage).
- **Coûts IA** : dépense mensuelle qui dépasse 50 € (anomalie sur prompt sourcing).

## 11. Plage personnalisée (J1)
Sur **Activité Tandem** et **Coûts IA**, à côté des boutons 7 / 30 / 90 j, un bouton **Personnalisée** ouvre un petit popover avec 2 date pickers du / au. Pratique pour zoomer sur une période bien précise — une semaine en juin, ou tout un trimestre. Limite haute : 366 jours. La sélection passe dans l'URL (\`?range=custom&from=…&to=…\`) — tu peux la mettre en favori.

## 12. Déclencher un cron à la demande (superadmin)
Sur **Crons**, un panneau « Déclencher manuellement » te propose 4 boutons (un par cron). Cliquer **▶ Déclencher maintenant** lance la tâche tout de suite sans attendre le tick Vercel. Pratique pour :
- tester juste après une migration ou une rotation de secret
- re-jouer un cron qui a planté ce matin sans attendre demain
- débugger en local quand tu suspectes que c'est le runner qui pose problème

Le résultat (HTTP status, durée, aperçu JSON de la réponse) s'affiche immédiatement sous le panneau. Tu peux refresh la page : la nouvelle row apparaît dans le tableau des 100 dernières exécutions.`;

const GUIDE_13 = `Les CERFA officiels DC1 et DC2 sont des formulaires Word pénibles à remplir à la main. edifio Sourcing peut maintenant les remplir tout seul à partir de **tes propres modèles .docx** — tu gardes la mise en page exacte et tu obtiens un .docx final éditable.

## 1. Pourquoi cette voie A
Avant : edifio générait un PDF custom via pdf-lib. Résultat propre, mais éloigné du CERFA officiel ; certains acheteurs publics pinaillent. Maintenant tu peux uploader ton propre **modèle Word** avec la mise en page, le logo, l'en-tête, les en-têtes / pieds de page exactement comme tu veux — l'app ne fait que remplacer les balises Mustache.

## 2. Préparer ton modèle Word
1. Ouvre ton fichier **DC1 ou DC2 vierge** (.docx). Si tu n'as que la version .doc, ouvre-la dans Word puis **Enregistrer sous → Document Word (*.docx)**.
2. À chaque endroit où tu veux qu'edifio écrive une valeur, tape une balise entre **double accolades** : \`{{archi_cabinet}}\`, \`{{ao_objet}}\`, \`{{org_nom}}\`, etc.
3. Garde la mise en forme **homogène à l'intérieur d'une balise** — si tu mets une lettre en gras au milieu d'\`{{ao_objet}}\`, Word fragmente la balise en XML et le remplacement peut échouer. L'app sait recoller dans 90 % des cas, mais autant éviter.
4. Tu peux aussi mettre des balises dans l'en-tête / pied de page : l'app les remplace aussi.

## 3. Les balises disponibles
- **Contexte AO** : \`{{ao_objet}}\`, \`{{ao_acheteur}}\`, \`{{org_nom}}\`, \`{{archi_cabinet}}\`, \`{{be_cabinet}}\`, \`{{date_jour}}\`, \`{{date_iso}}\`
- **Tout champ saisi côté CERFA** : utilise le \`field_id\` tel qu'il apparaît dans le pré-remplissage. Exemples : \`{{archi_siret}}\`, \`{{archi_adresse}}\`, \`{{alyos_siret}}\`, \`{{forme_juridique}}\`, …
- **Référence complète** : voir le handoff \`STEVE_260603_TEMPLATES_DOCX_MUSTACHE.md\` (Cowork t'a posé la liste exhaustive).

Si tu mets une balise inconnue (typo ou champ pas encore mappé), l'app la laisse telle quelle dans le document — tu vois immédiatement quelle balise n'a pas été remplie et tu peux la corriger dans ton modèle.

## 4. Uploader le modèle
Va dans **Configuration > Bibliothèque** et uploade ton .docx dans la catégorie **DC1** ou **DC2** (ou **Pouvoir mandataire** pour le 3e). Si tu remplaces un ancien modèle, tu peux soit le supprimer soit le laisser : edifio prend toujours **le plus récent** par catégorie.

## 5. Tester
Ouvre un AO, va dans l'onglet **Dossier > CERFA**, remplis les champs comme d'habitude et clique **Valider DC1** ou **Valider DC2**. Au lieu d'un PDF, edifio te livre maintenant un **.docx** que tu peux télécharger, ouvrir dans Word, vérifier, ajouter ta signature manuscrite scannée, puis exporter en PDF si tu veux.

## 6. Si l'app continue à sortir des PDF
C'est que le template biblio est introuvable. Vérifie que :
- Tu as bien uploadé en catégorie **DC1** ou **DC2** (et pas dans « Autres »).
- Le fichier a bien l'extension **.docx** (pas .doc).
- Tu es bien connecté avec un compte de la même organisation (AlyoS).

Si le template est mal formé (corruption, balises non parsables), edifio retombe transparent sur le PDF custom — pas de plantage, mais tu auras un PDF au lieu d'un .docx. Regarde les logs Vercel pour le détail (\`[cerfa:validate:docx:fail-fallback-pdf]\`).

## 7. Fallback rétro-compatible
Tant qu'il n'y a pas de modèle .docx en biblio, edifio garde l'ancien comportement (PDF pdf-lib). Tu peux donc activer la voie A AO par AO en uploadant le modèle quand tu es prêt. Aucun risque de casser ce qui marche aujourd'hui.`;

const GUIDE_14 = `Un matin, tu regardes ta file AO du jour : elle est vide. Le cron de 6h30 a tourné (la card sur **Crons** est verte) mais rien n'a été ajouté. Comment savoir pourquoi ? Ce guide te donne le réflexe : ouvre **Debug sourcing** et lis les 3 sections dans l'ordre.

## 1. Premier réflexe : ouvrir Debug sourcing
La page **Admin > Debug sourcing** (réservée superadmin) répond à 3 questions en une visite :
1. Ta config profil a-t-elle changé depuis la baseline ?
2. Ton profil actif a-t-il bien des mots-clés ?
3. Le pipeline BOAMP rejette les records sur quel motif ?

Lis-les dans cet ordre — chaque réponse oriente la suivante.

## 2. Section « Diff vs baseline du 22/05/2026 »
edifio garde en dur le **snapshot du 22/05** de ton profil AlyoS BTP — la dernière config dont on est sûr qu'elle ramenait des AOs (24 positives + 9 négatives + 0 CPV + 23 départements + market_types moe/services/fournitures).

Trois statuts possibles par ligne :
- 🟢 **OK** : valeur identique à la baseline.
- 🟠 **Drift** : valeur différente, potentiellement bénin. Exemple : tu as ajouté des mots-clés positifs (élargissement). À valider si tu l'as fait sciemment.
- 🔴 **Régression** : valeur INFÉRIEURE à la baseline. C'est probablement la cause du « 0 inserted ». Exemple : tu as perdu 10 mots-clés positifs entre temps, donc 10 sources de matching en moins.

Une phrase de synthèse en haut du tableau te dit immédiatement où tu en es :
- « Aligné — config inchangée » → la baseline matche, le problème vient d'ailleurs.
- « Dérive détectée — à valider si intentionnelle » → tu as bougé des trucs récemment, vérifie que c'était voulu.
- « Régression détectée — probable cause du 0 inserted » → action immédiate sur le profil.

## 3. Section « Profils de recherche actifs »
Si la diff baseline ne te suffit pas (par exemple parce que tu as un nouveau profil ajouté depuis), descends à la section **« Profils de recherche actifs »**. Elle affiche pour chaque profil active=true :
- Badge **Par défaut** si applicable.
- 6 chips colorées : positives (vert), négatives (rouge), exacts, CPV, géo, types de marché. Limite 8 chips affichées + « + N… » pour les longues listes.
- Bornes montant si présentes.
- **Bordure rouge à gauche + bandeau « Aucun mot-clé positif »** si \`keywords.positive\` est vide — la cause n°1 du « 0 inserted ». Sans positives, AUCUN record BOAMP ne peut passer le filtre.

S'il n'y a aucun profil actif → bandeau d'alerte rouge avec lien direct vers **Configuration > Profils de recherche**.

## 4. Section « Pourquoi les records ont été rejetés ? »
Si ton profil a l'air OK et que la diff baseline est verte, descends jusqu'à la décomposition du dernier run. Pour chaque cause de rejet, edifio te donne :
- Le libellé humain (« CPV hors liste », « Montant sous le seuil minimum »…)
- Le compteur + le pourcentage du total fetched
- Une barre de proportion visuelle
- Un **hint d'action concret** : ce que tu dois ajuster sur le profil pour rééquilibrer.

Les hints connus :
- **« Aucun mot-clé positif trouvé »** → \`keywords.positive\` est vide. Repopule.
- **« CPV hors liste »** → la liste \`cpvCodes\` est trop restrictive. Ajoute les codes qui matchent ton activité ou retire le filtre CPV pour ne plus filtrer dessus.
- **« Montant sous/au-dessus du seuil »** → ajuste \`amountMin\` / \`amountMax\` selon ton marché cible.
- **« Mot-clé exclu : "X" »** → un mot-clé négatif match ce record. Si tu vois beaucoup de records rejetés sur le même mot-clé négatif, tu surrestreins.

## 5. Section « Tendance — 7 derniers runs OK »
Mini-graphique CSS qui montre l'évolution sur les 7 dernières runs OK : barres jaunes pour le fetched BOAMP, sur-couche verte pour l'inserted. Tu vois en un coup d'œil :
- Si fetched chute → BOAMP est plus calme, période creuse.
- Si fetched stable mais inserted chute → ton profil a régressé.
- Si tout est stable → tout va bien.

Tooltip au survol pour le détail (date + fetched + inserted + durée).

## 6. Action concrète selon le scénario
- **Mystère « 0 inserted » avec diff régression sur positives** : va dans Configuration > Profils de recherche, ouvre le profil par défaut, repopule \`keywords.positive\` avec tes 24 mots-clés baseline. Refais un trigger manuel via **Crons > ▶ Déclencher sourcing-run**. Vérifie immédiatement le résultat sur Debug sourcing.
- **Mystère « 0 inserted » avec diff aligné** : la config marche, mais BOAMP n'a rien renvoyé qui match. Vérifie sur la tendance 7j si c'est exceptionnel ou récurrent. Si récurrent → tes mots-clés sont peut-être trop pointus pour le marché actuel, élargis.
- **Mystère « tout filtré sur CPV »** : retire le filtre CPV (la baseline ne l'utilisait pas — c'est exactement pour ça) ou ajoute les codes qui manquent.

## 7. Quand demander l'aide CTO Sophie
- Si la config est alignée baseline ET que la tendance montre 0 inserted depuis > 3 jours → BOAMP a peut-être changé son schéma. Logs Vercel + ouverture issue.
- Si tu ne sais plus quelle est ta « bonne » config et que la baseline 22/05 n'est plus valable → on enregistre un nouveau snapshot dans \`baseline-profiles.ts\` (PR rapide, je m'en occupe).
- Si la diff montre une régression que tu n'as pas faite manuellement → fouille les logs \`/admin/audit\` pour identifier qui/quand. Possible bug ou autre admin qui a touché.`;

const GUIDE_15 = `Quand tu réponds à un AO, certaines pièces du dossier sont **universelles** (Kbis, attestations, RC pro) et tu les joints toujours. D'autres sont **contextuelles** : tu inclus une fiche de référence patrimoine si l'AO porte sur de la restauration, pas si c'est un gymnase. edifio Sourcing peut maintenant gérer ce tri automatiquement avec les **fiches métiers**.

## 1. Le concept
Une « fiche métier » est un document de référence que tu joins seulement si l'AO traite d'un sujet précis. Tu l'uploades une fois dans la bibliothèque avec des **mots-clés associés**, et l'app décide tout seul si elle l'inclut dans le ZIP du dossier en fonction de tes mots-clés de **profil de recherche actif**.

Exemple concret :
- Tu uploades \`fiche_patrimoine.pdf\` avec les mots-clés \`patrimoine, ABF, restauration, étude historique\`.
- Ton profil de recherche actif a dans ses \`keywords.positive\` les mots \`patrimoine\` et \`école primaire\`.
- Tu réponds à un AO « Réhabilitation école patrimoine XVIIIe » → la fiche est incluse au ZIP (intersection : « patrimoine »).
- Tu réponds à un AO « Construction crèche neuve » → la fiche n'est pas incluse (aucune intersection).

## 2. Uploader une fiche métier
1. Va dans **Configuration > Bibliothèque** (admin uniquement).
2. Sélectionne la catégorie **« Fiches métiers (sélection auto par mots-clés) »** en haut du formulaire d'upload.
3. Choisis le fichier (PDF, DOCX, JPG, PNG — max 10 Mo).
4. Saisis les **mots-clés associés** séparés par des virgules :
   - \`patrimoine, ABF, restauration\` → court et précis
   - Max 20 mots-clés par fiche, 80 caractères chacun
   - Insensible à la casse (« Patrimoine » == « patrimoine »)
5. Submit. La fiche apparaît dans la section « Fiches métiers » avec ses mots-clés affichés en chips vertes.

## 3. Visualiser les mots-clés sur une fiche
Sur la page Bibliothèque, chaque fiche métier affiche en dessous de son nom :
- **Chips vertes** : les mots-clés actuellement associés. Si tu les vois, c'est qu'elle est candidate à l'inclusion auto.
- **Badge orange « ⚠ Aucun mot-clé — fiche jamais incluse au ZIP »** : tu as oublié de poser des mots-clés. Sans eux, l'app ne saura jamais quand l'inclure et la fiche restera dormante. Action : supprime-la et ré-uploade-la avec des mots-clés.

## 4. Vérifier que ton profil a les bons positives
Le matching se fait contre les \`keywords.positive\` du **profil de recherche actif par défaut** de l'organisation.
- Va sur **Configuration > Profils de recherche**.
- Ouvre ton profil par défaut.
- Vérifie que la liste des mots-clés positifs contient des mots qui matchent tes fiches métiers. Si tu utilises \`patrimoine\` dans 3 fiches mais que ton profil n'a que \`école\` et \`gymnase\` en positifs, aucune ne sera incluse.

Conseil : utilise les **mêmes vocabulaires** entre tes fiches métiers et ton profil. Si tu écris \`ABF\` sur la fiche, écris aussi \`ABF\` (pas \`bâtiment de France\`) dans le profil.

## 5. Au moment de compiler le dossier
Tu n'as rien à faire de spécial — c'est automatique. À la compile :
1. L'app charge ton profil actif par défaut.
2. Pour chaque fiche métier de ta biblio, elle vérifie : « est-ce qu'au moins un mot-clé de la fiche apparaît dans les positives du profil ? »
3. Si oui → la fiche est ajoutée au ZIP, dans le même répertoire que les autres pièces.
4. Si non → la fiche est ignorée silencieusement.

Tu n'as donc qu'une seule chose à gérer : **maintenir tes fiches métiers + leurs mots-clés à jour**. L'app fait le tri pour toi sur chaque AO.

## 6. Et les autres docs de la biblio ?
Les autres catégories (Kbis, URSSAF, attestations…) gardent leur comportement **inconditionnel** : tant que le doc est valide (pas expiré, pas un template DC1/DC2), il est joint à TOUS les ZIPs. C'est exactement ce que tu veux pour ces pièces administratives universelles.

Seules les **fiches métiers** ont un matching conditionnel par mots-clés.

## 7. Cas d'usage typiques
- **Fiche par lot métier** : \`fiche_lot_GO.pdf\` (gros œuvre), \`fiche_lot_électricité.pdf\`, \`fiche_lot_chauffage.pdf\` avec leurs mots-clés respectifs. L'app inclut seulement le lot qui matche l'AO.
- **Fiche par type d'ouvrage** : école, gymnase, crèche, EHPAD, logement social… une fiche par type avec son mot-clé. Tu n'as plus à choisir manuellement à chaque dossier.
- **Fiche par référence client** : si tu as une réalisation référence sur du patrimoine, tu la mets en fiche métier avec \`patrimoine, restauration\`. Elle s'inclut automatiquement sur les bonnes réponses.

## 8. Quand pas utiliser les fiches métiers
Si tu as un document que tu veux joindre à **TOUS** tes dossiers (référence générique, présentation cabinet, etc.), utilise la catégorie **« Présentation de l'entreprise »** ou **« Références de marchés »** — inconditionnel. Si tu mets cette pièce en fiche métier sans mots-clés, elle ne sera jamais incluse, et avec un seul mot-clé trop large elle s'incluera partout (ce qui te fait perdre le bénéfice du tri auto).

## 9. Mise à jour des mots-clés d'une fiche existante
Au MVP, il n'y a pas d'édition inline des mots-clés (limitation connue). Pour modifier : supprime la fiche et ré-uploade-la avec les nouveaux mots-clés. Une fonction d'édition arrivera en V2.`;

const GUIDE_16 = `Tu as un historique de **références** de marchés AlyoS — parfois plusieurs centaines de lignes. Tu n'as pas envie de joindre toute la liste à chaque dossier (l'acheteur n'a pas le temps de la lire) ni de re-trier à la main à chaque AO. edifio Sourcing fait le filtrage tout seul, à partir de **mots-clés**, sur deux formats au choix : un **tableau Excel** maître ou des **fiches A4** individuelles.

## 1. Les deux flux complémentaires
| Flux | Format | Quand l'utiliser |
|---|---|---|
| **A — Tableau Excel maître** | Un seul \`.xlsx\` (1 ligne = 1 référence + colonne « Mots-clés ») | Quand tu as 30 à 500 références listées dans un tableau de pilotage interne |
| **B — Fiches référence A4** | N fichiers \`.pdf\`/\`.docx\` (1 fichier = 1 référence) | Quand tu as des fiches détaillées avec photos, plans, retour client |

Les deux flux peuvent coexister. À la compile du dossier, l'app inclut le tableau Excel filtré ET les fiches A4 matchantes dans un sous-dossier \`Références/\` du ZIP.

## 2. Préparer ton tableau Excel maître
1. Une feuille (la 1ère du fichier sera scannée).
2. 1ère ligne = en-têtes de colonnes (texte). L'app a besoin de trouver une colonne nommée **« Mots-clés »** (les variantes « Mots cles », « Keywords », « MOTS-CLÉS » sont reconnues — case et accents tolérés).
3. À partir de la 2e ligne, une référence par ligne. Toutes les autres colonnes (Référence, Acheteur, Montant, Année, etc.) sont conservées telles quelles dans le ZIP — elles sont juste filtrées par les mots-clés.
4. Dans la cellule « Mots-clés », sépare les termes par **virgule**, **point-virgule** OU **retour à la ligne** — les trois sont acceptés. Exemple : \`patrimoine, ABF, restauration\` ou \`patrimoine; restauration\`.

Exemple de tableau :

| Référence | Acheteur | Mots-clés | Montant |
|---|---|---|---|
| R001 | Mairie de Lyon | patrimoine, restauration | 450 000 € |
| R002 | CC Sud | scolaire, école primaire | 280 000 € |
| R003 | Ville de Bron | voirie, espaces verts | 175 000 € |

## 3. Uploader le tableau Excel
1. Va dans **Configuration > Bibliothèque** (admin uniquement).
2. Catégorie **« Tableau Excel des références (1 seul fichier, filtré auto par profil) »**.
3. Choisis ton fichier \`.xlsx\` et submit.
4. À l'upload, l'app **valide** que la colonne « Mots-clés » est bien présente. Si elle ne la trouve pas, tu reçois un message d'erreur explicite — corrige et ré-uploade.
5. Un seul tableau par organisation : un nouvel upload **remplace** l'ancien (l'ancien fichier Storage est supprimé automatiquement).

## 4. Préparer tes fiches référence A4
Pour les références que tu veux présenter en fiche détaillée (photo, plan, mémoire de chantier) :
1. Une fiche par référence (PDF ou DOCX, format A4 recommandé).
2. Uploade dans la catégorie **« Fiches référence A4 (sélection auto par mots-clés) »**.
3. Saisis les mots-clés associés séparés par des virgules (max 20 mots-clés, 80 caractères chacun).
4. C'est la même mécanique que les fiches métiers (cf. Guide 15) — chips vertes affichées sur la card.

## 5. Au moment de compiler le dossier
Tu n'as rien à faire — c'est automatique :
1. L'app charge ton profil de recherche actif et récupère ses **keywords positifs**.
2. Pour le **tableau Excel** : elle parcourt chaque ligne, normalise la cellule « Mots-clés » (insensible casse + accents), garde les lignes dont au moins un mot-clé intersecte les positives du profil. Le tableau résultant est inclus au ZIP sous \`Références/tableau_references_filtre.xlsx\`. Si zéro ligne ne matche → pas de fichier (le ZIP n'embarque pas un tableau vide).
3. Pour les **fiches A4** : même logique — chaque fiche dont les matching_keywords intersectent le profil est incluse dans \`Références/\`.

L'acheteur reçoit donc un sous-dossier \`Références/\` contenant uniquement les références pertinentes pour son AO — propre, court, ciblé.

## 6. Bonnes pratiques de mots-clés
- **Vocabulaire cohérent** entre tes références et ton profil de recherche actif. Si tu écris \`ABF\` dans le tableau, écris aussi \`ABF\` (pas \`Bâtiment de France\`) dans les positives du profil.
- **Pas de mots-clés trop génériques** (\`construction\`, \`marché\`) qui matcheraient toutes les références.
- **Pas de mots-clés trop spécifiques** (\`Mairie de Lyon\`) qui ne matcheraient qu'un AO sur 1000.
- **Granularité métier + ouvrage** : combine \`patrimoine\` + \`école\` + \`gymnase\` + \`logement social\` + \`voirie\` etc. Idem pour les compétences : \`étude historique\`, \`OPC\`, \`énergétique\`.

## 7. Vérifier que ton profil a les bons positives
- Va sur **Configuration > Profils de recherche**.
- Ouvre ton profil actif par défaut.
- Vérifie que les positives recouvrent les mots-clés utilisés dans ton tableau Excel et tes fiches A4.

Conseil : tiens à jour un **lexique partagé** quelque part (Notion, doc Word) entre profil et bibliothèque. Si tu décides un jour d'utiliser \`MOE\` à la place de \`maîtrise d'œuvre\`, propage la modif partout.

## 8. Mise à jour du tableau Excel
Pas de versioning ni de diff au MVP — un nouvel upload écrase l'ancien :
1. Ouvre ton tableau Excel local, modifie les lignes, sauvegarde.
2. Retourne dans **Bibliothèque > Tableau Excel des références** et re-submit.
3. L'app valide la colonne « Mots-clés », supprime l'ancien tableau du Storage et insère le nouveau.

## 9. Cas typiques
- **Tableau seul** : tu n'as pas de fiches A4 détaillées, juste une liste de marchés. L'acheteur reçoit le tableau filtré, c'est suffisant.
- **Fiches A4 seules** : tu as une vingtaine de fiches projet riches mais pas de tableau récap. L'app inclut uniquement les fiches matchantes.
- **Les deux** : référentiel exhaustif en Excel + fiches détaillées pour les 10-20 références phares. L'acheteur a la vue d'ensemble + le détail des plus marquantes.`;

const GUIDE_17 = `Sur la plupart des dossiers de candidature, l'acheteur veut connaître l'équipe qui répondra au marché : qui sont les chefs de projet, les architectes, les BET, les conducteurs de travaux mobilisés ? On joint donc des **CV** des intervenants — mais pas TOUS les CV de l'entreprise à chaque dossier. Tu veux celui qui correspond à l'AO. edifio Sourcing automatise cette sélection comme pour les fiches métiers et les fiches référence.

## 1. Le concept
Tu uploades une fois pour toutes les CV de tes intervenants dans la bibliothèque (un fichier par personne, format A4 PDF ou DOCX) avec des **mots-clés associés** qui décrivent leurs spécialités. À la compile du dossier, edifio Sourcing inclut automatiquement dans le ZIP les CV dont au moins un mot-clé intersecte les **keywords positifs** du profil de recherche actif.

Exemple concret :
- Tu uploades \`cv_jean_dupont_archi_patrimoine.pdf\` avec mots-clés \`patrimoine, ABF, restauration, monuments historiques\`.
- Tu uploades \`cv_marie_martin_archi_scolaire.pdf\` avec mots-clés \`scolaire, crèche, périscolaire, ERP\`.
- Tu uploades \`cv_paul_durand_bim_manager.pdf\` avec mots-clés \`BIM, IFC, REVIT, maquette numérique\`.
- Pour un AO « Réhabilitation d'une école patrimoine en BIM », l'app inclut \`cv_jean_dupont\` (patrimoine) et \`cv_paul_durand\` (BIM), pas \`cv_marie_martin\` (scolaire neuf — pas dans le profil).

## 2. Uploader un CV
1. Va dans **Configuration > Bibliothèque** (admin uniquement).
2. Catégorie **« CV des intervenants (sélection auto par mots-clés) »**.
3. Choisis le fichier (PDF, DOCX, JPG, PNG — max 50 Mo).
4. Saisis les **mots-clés associés** séparés par des virgules :
   - Spécialité métier : \`patrimoine, ABF, scolaire, EHPAD, logement social\`
   - Compétences techniques : \`BIM, REVIT, IFC, énergétique, RT2020, RE2020\`
   - Rôles : \`OPC, mandataire, conducteur d'opération, AMO\`
   - Max 20 mots-clés, 80 caractères chacun
5. Submit. Le CV apparaît dans la section avec ses chips vertes.

## 3. Bonnes pratiques de mots-clés sur les CV
- **Vocabulaire métier + outil + rôle** : sur le CV d'un BET structure expert patrimoine, tag-le avec \`patrimoine\` (domaine) + \`structure\` (lot) + \`BET\` (rôle).
- **N'utilise pas le NOM du collaborateur comme mot-clé** : ça ne matche jamais avec le profil de recherche.
- **Évite les mots trop génériques** comme \`architecte\` ou \`ingénieur\` qui matcheraient quasiment tous les AO.
- **Ouvre des slots de spécialisation** pour des AO récurrents : si tu réponds régulièrement à des AO « gymnase », assure-toi qu'au moins 1-2 CV est tagué \`gymnase\`.

## 4. Vérifier la cohérence avec ton profil de recherche
Le matching se fait contre les \`keywords.positive\` du **profil de recherche actif par défaut**. Va sur **Configuration > Profils de recherche** et vérifie que ton vocabulaire est aligné entre profil et CV. Si tu écris \`maquette numérique\` sur tes CV mais \`BIM\` dans le profil, aucun CV BIM ne sera inclus.

## 5. Au moment de compiler le dossier
Tu n'as rien à faire de spécial. À la compile :
1. L'app charge le profil actif et ses keywords positifs.
2. Pour chaque CV de la biblio, vérifie l'intersection avec les keywords.
3. Si intersection → CV ajouté au ZIP dans le même dossier que les autres pièces.
4. Si pas d'intersection → CV ignoré silencieusement.

Le ZIP final contient donc une **équipe ciblée** pour l'AO, pas le trombinoscope complet de la boîte.

## 6. Cas typiques de tagage
- **Archi senior patrimoine** : \`patrimoine, ABF, monuments historiques, restauration, étude historique\`
- **Archi scolaire/petite enfance** : \`scolaire, école, crèche, périscolaire, ERP, accessibilité\`
- **Archi logement** : \`logement social, logement collectif, bailleur, ZAC, neuf, réhabilitation\`
- **BIM Manager** : \`BIM, IFC, REVIT, ARCHICAD, maquette numérique, coordination BIM\`
- **BET structure** : \`structure, béton armé, charpente, métal, bois, fondations spéciales\`
- **BET fluides énergétique** : \`fluides, CVC, plomberie, électricité, énergétique, RE2020\`
- **Économiste** : \`économie de la construction, DPGF, BPU, coût\`
- **OPC** : \`OPC, ordonnancement, pilotage, coordination chantier\`

## 7. Mise à jour des mots-clés d'un CV existant
Au MVP, pas d'édition inline des mots-clés (même limitation que pour les fiches métiers et les fiches référence). Pour modifier : supprime + ré-uploade avec les nouveaux mots-clés. Une fonction d'édition arrivera en V2.

## 8. Bien penser au cas Tandem multi-archi
Si tu réponds en Tandem avec un archi externe et que cet archi t'a fourni son CV, ajoute-le en biblio (avec les mots-clés métier qui le caractérisent). Ses mots-clés se cumulent à ceux de tes propres CV — au moment de la compile, l'app inclut TOUS les CV matchants, peu importe leur origine (tes équipes ou ton cotraitant).`;

const GUIDE_18 = `Chaque fois que tu écartes un appel d'offres, tu peux dire **pourquoi**. edifio s'en sert pour t'aider à affiner ton profil de recherche — et donc à recevoir des AO plus pertinents demain. Tu gardes toujours la main : edifio te **propose**, c'est toi qui décides.

## 1. « Écarter » ≠ « Exclure »
Deux boutons, deux logiques :
- **Écarter** (avec un motif) : tu sors l'AO de ta file ET tu donnes une raison. Cette raison **alimente l'apprentissage** : elle peut faire émerger une suggestion d'ajustement du profil.
- **Exclure** : tu sors juste l'AO de la liste, sans donner de raison. C'est **neutre** : aucun effet sur l'algorithme de recherche. Utile pour cacher un AO sans rien changer à ton profil.

Retiens : si tu veux que ton choix « compte » pour affiner la recherche, utilise **Écarter** avec un motif.

## 2. Les 6 motifs d'écartement
Quand tu cliques sur **Écarter**, une fenêtre te propose 6 motifs (un seul à cocher) + un champ libre optionnel :
- **Hors zone géographique** — le marché est trop loin de tes équipes.
- **Budget / CA trop faible** — le montant ne justifie pas une réponse.
- **Hors métier / compétence** — ce n'est pas ton domaine.
- **Délai trop court** — pas le temps de monter un dossier sérieux.
- **Concurrence trop forte** — peu de chances de l'emporter.
- **Autre** — tout le reste (précise dans le champ libre).

Les 3 premiers sont **actionnables** : ils peuvent générer une suggestion concrète d'ajustement du profil. Les 3 derniers sont simplement **tracés** (ils n'agissent pas sur l'algo).

## 3. Comment naît une suggestion
edifio observe tes écartements sur les **30 derniers jours**. Dès que **3 AO** ont été écartés pour le **même motif actionnable**, une suggestion apparaît dans **Configuration > Profils de recherche**, en haut de page, dans l'encart « Suggestions d'ajustement ».

Exemples concrets :
- 3 AO écartés pour « hors zone » sur les départements 13 et 83 → edifio te propose de **retirer 13 et 83** de tes zones de recherche.
- 3 AO écartés pour « budget trop faible », le plus élevé valait 180 000 € → edifio te propose de **relever ton budget minimum** à ~198 000 €.
- 3 AO écartés pour « hors métier » avec « informatique » revenant souvent → edifio te propose d'**ajouter « informatique » en mot-clé négatif**.

## 4. Appliquer ou ignorer
Chaque suggestion a deux boutons :
- **Appliquer** : edifio modifie ton profil par défaut (retrait de département, nouveau budget minimum, ou ajout de mot-clé négatif). La modification est tracée dans le journal d'audit.
- **Ignorer** : la suggestion disparaît et ne reviendra pas pour ces écartements-là. Ton profil reste inchangé.

Rien ne se modifie tout seul. Tant que tu n'as pas cliqué **Appliquer**, ton profil ne bouge pas.

## 5. Bonnes pratiques
- **Sois honnête sur le motif** : si tu coches « hors zone » alors que c'était un problème de délai, tu fausses l'apprentissage.
- **Le champ libre est ton ami pour « hors métier »** : c'est lui qui permet à edifio de repérer les termes récurrents à proposer en négatif. Écris des mots clairs (« informatique », « nettoyage », « espaces verts »).
- **Relis avant d'appliquer** : une suggestion « retirer le 13 » est définitive côté profil (réversible manuellement, mais autant vérifier). Si le 13 reste stratégique malgré quelques AO ratés, **Ignore**.
- **Pas de panique si rien n'apparaît** : tant que tu n'as pas 3 écartements même motif sur 30 jours, c'est normal qu'il n'y ait aucune suggestion.

## 6. Où ça vit
Tout se passe dans **Configuration > Profils de recherche** (réservé aux administrateurs). L'encart « Suggestions d'ajustement » ne s'affiche que **s'il y a quelque chose à proposer** — sinon, tu ne vois que tes profils, comme d'habitude.`;

export const FORMATIONS_CONTENT_FIXTURE: FormationSeed[] = [
  {
    id: "fb000001-0000-0000-0000-000000000001",
    slug: "prise-en-main",
    title: "Prendre en main edifio Sourcing en 10 minutes",
    description: "Tour d'horizon : connexion, AO du jour, premier traitement d'annonce.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_1,
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "fb000001-0000-0000-0000-000000000002",
    slug: "ao-du-jour",
    title: "Traiter sa file « AO du jour »",
    description: "Reporter, écarter, lire le brief, ouvrir l'annonce et le DCE.",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_2,
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "fb000001-0000-0000-0000-000000000003",
    slug: "cotraitance",
    title: "Répondre en cotraitance avec un architecte",
    description: "Comprendre la shortlist, solliciter un architecte, suivre les réponses.",
    type: "doc",
    durationMin: 8,
    contentMd: GUIDE_3,
    isActive: true,
    displayOrder: 3,
  },
  {
    id: "fb000001-0000-0000-0000-000000000004",
    slug: "contacts-coffre-bet",
    title: "Gérer les contacts et le coffre documentaire BET",
    description: "Annuaires Architectes / BE / Entreprises, pièces administratives et expirations.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_4,
    isActive: true,
    displayOrder: 4,
  },
  {
    id: "fb000001-0000-0000-0000-000000000005",
    slug: "modes-de-reponse",
    title: "Choisir ton mode de réponse à un AO",
    description:
      "Solo, Tandem, Cotraitance BE : quand utiliser quoi et ce que ça change pour le dossier.",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_5,
    isActive: true,
    displayOrder: 5,
  },
  {
    id: "fb000001-0000-0000-0000-000000000006",
    slug: "analyse-rc-pieces",
    title: "Analyser le RC et compléter ton dossier",
    description:
      "Import du RC, analyse IA Claude, matching automatique avec ta bibliothèque entreprise.",
    type: "doc",
    durationMin: 8,
    contentMd: GUIDE_6,
    isActive: true,
    displayOrder: 6,
  },
  {
    id: "fb000001-0000-0000-0000-000000000007",
    slug: "dc1-dc2-pouvoir-zip",
    title: "Préparer DC1, DC2, Pouvoir et compiler le ZIP final",
    description:
      "Génération CERFA pdf-lib, Pouvoir depuis la bibliothèque, compilation du ZIP contextualisé.",
    type: "doc",
    durationMin: 9,
    contentMd: GUIDE_7,
    isActive: true,
    displayOrder: 7,
  },
  {
    id: "fb000001-0000-0000-0000-000000000008",
    slug: "diffusion-dossier-archi",
    title: "Valider et envoyer le dossier à l'architecte",
    description:
      "Page short-list, bouton de diffusion, mail Brevo et bascule du statut en dossier_diffused.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_8,
    isActive: true,
    displayOrder: 8,
  },
  {
    id: "fb000001-0000-0000-0000-000000000009",
    slug: "indexation-ia-biblio",
    title: "Indexer ta bibliothèque entreprise avec Claude IA",
    description:
      "Bouton 🤖 Indexer la bibliothèque, panneau dépliable des métadonnées Claude, ré-indexation 1-clic, détection d'index obsolète et audit ai_runs.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_9,
    isActive: true,
    displayOrder: 9,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000a",
    slug: "expirations-biblio",
    title: "Surveiller les expirations d'attestations dans ta bibliothèque",
    description:
      "Badges visuels J−7/J−30, bandeaux d'avertissement avant compile dossier, mail digest hebdo aux admins.",
    type: "doc",
    durationMin: 5,
    contentMd: GUIDE_10,
    isActive: true,
    displayOrder: 10,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000b",
    slug: "export-csv-ao-du-jour",
    title: "Exporter les AO du jour au format Excel pour ton tableau Veille_AO",
    description:
      "Bouton 📥 Export Excel (CSV), 38 colonnes alignées sur ton modèle xlsx, séparateur ; et BOM UTF-8 pour Excel français.",
    type: "doc",
    durationMin: 4,
    contentMd: GUIDE_11,
    isActive: true,
    displayOrder: 11,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000c",
    slug: "pilotage-admin-observabilite",
    title: "Piloter l'activité depuis les dashboards admin",
    description:
      "Filtres 7/30/90j, recherche dans les sollicitations Tandem, historique des envois de dossiers avec filtre actifs/annulés, recherche live dans la bibliothèque, observabilité des crons (superadmin).",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_12,
    isActive: true,
    displayOrder: 12,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000d",
    slug: "cerfa-docx-templates",
    title: "Personnaliser les CERFA DC1/DC2 avec tes propres modèles Word",
    description:
      "Voie A : tu uploades ton propre .docx avec des balises Mustache, l'app le remplit à la validation. Plus jamais de PDF mal aligné.",
    type: "doc",
    durationMin: 5,
    contentMd: GUIDE_13,
    isActive: true,
    displayOrder: 13,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000e",
    slug: "debug-sourcing-zero-inserted",
    title: "Diagnostiquer un sourcing à 0 inserted",
    description:
      "Le cron a tourné vert mais ta file AO du jour est vide. Le réflexe en 3 étapes : Diff baseline, Profils actifs, Décomposition par cause de rejet.",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_14,
    isActive: true,
    displayOrder: 14,
  },
  {
    id: "fb000001-0000-0000-0000-00000000000f",
    slug: "fiches-metiers-matching-auto",
    title: "Fiches métiers : utiliser le matching auto",
    description:
      "Une fiche par sujet métier (patrimoine, ABF, gymnase…) + des mots-clés, et l'app décide quelles fiches inclure dans le ZIP selon ton profil de recherche.",
    type: "doc",
    durationMin: 8,
    contentMd: GUIDE_15,
    isActive: true,
    displayOrder: 15,
  },
  {
    id: "fb000001-0000-0000-0000-000000000010",
    slug: "references-matching-auto",
    title: "Références : matching auto via tableau Excel + fiches A4",
    description:
      "Tableau Excel maître (filtré auto par profil) + fiches A4 individuelles avec matching keywords. L'acheteur reçoit un dossier Références/ ciblé.",
    type: "doc",
    durationMin: 8,
    contentMd: GUIDE_16,
    isActive: true,
    displayOrder: 16,
  },
  {
    id: "fb000001-0000-0000-0000-000000000011",
    slug: "cv-matching-auto",
    title: "CV : sélection auto des intervenants par mots-clés",
    description:
      "Upload des CV de tes intervenants avec leurs spécialités en mots-clés. L'app inclut au dossier uniquement les CV pertinents pour l'AO.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_17,
    isActive: true,
    displayOrder: 17,
  },
  {
    id: "fb000001-0000-0000-0000-000000000012",
    slug: "apprentissage-ecartement",
    title: "Affiner ta recherche en écartant des AO",
    description:
      "Quand tu écartes un AO avec un motif récurrent, edifio te propose d'ajuster ton profil de recherche. Tu gardes la main : applique ou ignore.",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_18,
    isActive: true,
    displayOrder: 18,
  },
];
