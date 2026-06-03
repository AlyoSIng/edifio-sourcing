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
];
