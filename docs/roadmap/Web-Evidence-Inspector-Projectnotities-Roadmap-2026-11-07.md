# DD Digital Web Evidence Inspector | Projectnotities en ontwikkelroadmap

**Datum:** 2026-11-07  
**Repository:** https://github.com/darjarihla-prog/dd-digital-web-evidence-inspector  
**Status:** Mission 027 afgerond en gemerged; roadmapvoorstellen nog niet geïmplementeerd  
**Doel:** Bewijsgericht onderzoek naar publiek zichtbare websites, met reproduceerbare observaties, controleerbare rapporten en verifieerbare herstelvergelijkingen.

## 1. Visie en afbakening

De Web Evidence Inspector ontwikkelt zich van een eenmalige websiteobservatie naar een transparant, lokaal uitvoerbaar onderzoeksinstrument. Het onderscheidende uitgangspunt is dat **observatie**, **bevinding**, **aanbeveling**, **bestandsintegriteit** en **authenticiteit** niet met elkaar worden verward.

De tool is geen offensieve kwetsbaarheidsscanner, geen juridische compliancecertificering en geen bewijs dat een website volledig veilig is. Onderzoek gebeurt alleen op toegestane doelen. Tests gebruiken bij voorkeur synthetische localhost-fixtures. Er is geen automatische upload van captures of telemetrie.

## 2. Bevestigde projectvoortgang

### Mission 025 | Evidence-first baseline en kwaliteitscontroles

- De baseline en bestaande capture-, assessment- en vergelijkingsfunctionaliteit zijn eerder gereviewd en gemerged.
- De bestaande suite omvatte 71 tests vóór Mission 027.
- De contracten voor bewijs en beoordeling maken expliciet onderscheid tussen PASS, REVIEW, FAIL en INCONCLUSIVE, afhankelijk van de uitgevoerde controles en waarnemingsbeperkingen.

### Mission 026 | Privacy- en publicatiecontrole

- Volgens de uitgevoerde lokale controle gaven Gitleaks-scans op geschiedenis en werkboom geen gevonden secrets.
- De repository gebruikte een noreply-commitidentiteit.
- Deze controles zijn momentopnames, geen garantie dat toekomstige wijzigingen geen gevoelige gegevens bevatten.

### Mission 027 | Evidence Integrity & Recovery Validation

**Resultaat:** PR #13 gemerged naar `main` op 2026-11-07.

- PR: https://github.com/darjarihla-prog/dd-digital-web-evidence-inspector/pull/13
- Featurecommit: `9e25cfd`
- Squash-mergecommit op main: `54cb5319037abd3ac4c85b170f1563b7421411f4`
- Post-merge GitHub Actions run: `42333596030`, volgens Claude Code PASS.
- Tests: **158/158 geslaagd**, 0 mislukt, 0 overgeslagen; 71 oorspronkelijke tests, 58 package-verification-tests en 29 compare-security-tests.
- CI-jobs: `secrets` en `test` geslaagd.

**Opgeleverde mogelijkheden:**

1. `verify`: offline, alleen-lezen controle van een bewijspakket en zijn manifest.
2. `recovery-verify`: vergelijking van originele en herstelde bewijspakketten op manifestbytes, bestandsset, groottes en SHA-256.
3. Strengere `compare`: manifestcontrole, veilige JSON-inlezing, weigering van symlinks, hardlinks, onveilige bestandsnamen en schadelijke uitvoerlocaties.
4. Optionele onafhankelijke manifestdigest via `--expected-manifest-sha256`.
5. Machineleesbare en deterministische resultaten, met expliciete fout- en beperkingsstatussen.

**Beveiligingsbevindingen opgelost en getest:**

- E1: symlink in bewijspakket.
- E2: dubbele JSON-objectkeys.
- L1: symlink in legacy-pakket zonder manifest.
- O1: uitvoer via dangling symlink buiten de doelmap.
- O2: uitvoermap binnen het bronpakket die bronbewijs kon wijzigen.

**Belangrijke grenzen:**

- Hashcontrole toont overeenstemming met een referentie, niet automatisch auteurschap, authenticiteit of correcte oorspronkelijke waarnemingen.
- Een legacy-pakket zonder manifest kan niet cryptografisch worden geverifieerd en wordt als `not-provided` gemarkeerd.
- Symlinks in bovenliggende onderdelen van een door de gebruiker gekozen uitvoerpad blijven toegestaan.
- Een lokaal proces dat mappen gelijktijdig kan vervangen, vormt een gedocumenteerd laag restrisico.
- Hardlinks worden uit voorzorg geweigerd; een herstelkopie via `cp -l` voldoet niet.
- Een succesvolle pakketvergelijking bewijst **niet** dat een herstelde WordPress-site malwarevrij, functioneel of correct geconfigureerd is.

## 3. Beoogde uitkomsten

### Uitkomst A | Open-source onderzoeksinstrument

Een reproduceerbare CLI voor toestemminggebonden websiteobservaties, gescheiden bewijsmateriaal en bevindingen, Nederlandstalige en Engelstalige rapportage en offline verificatie. Elke claim moet herleidbaar zijn tot een uitgevoerde controle en een concrete bron of artefact.

### Uitkomst B | DD Digital-dienstverlening

Een controleerbare technische basis voor website-audits, herstelcontrole en klantgerichte rapporten. Dienstverlening mag niet verdergaande garanties suggereren dan de uitgevoerde tests rechtvaardigen.

### Uitkomst C | Darja Rihla Applicable Knowledge

De repository kan dienen als leer- en portfolioomgeving: niet alleen tonen wat de tool doet, maar per beveiligingsprincipe uitleggen welke aanval of fout werd nagebootst, hoe de test is uitgevoerd, waarom de fix werkt en welke beperkingen overblijven. Publiceer uitsluitend synthetisch of geautoriseerd bewijs.

### Uitkomst D | Herbruikbare Evidence Integrity-laag

De bestaande manifest- en verificatieprincipes kunnen later, na expliciet ontwerp en tests, worden hergebruikt in andere DD Digital- en Darja Rihla-projecten. Hergebruik is een ambitie, geen reeds geleverde integratie.

## 4. Voorgestelde ontwikkelfasen

### Mission 028 | Recovery Validation Gate: ontwerp en lab

**Doel:** uitbreiden van pakketintegriteit naar aantoonbare herstelvalidatie in een geïsoleerde WordPress-testomgeving.

Voorgestelde controles:

1. Backup-integriteit: herkomstmetadata, datum, bestandsset, database-export en hashes.
2. Geïsoleerd herstel: geen automatische acties op productie; gebruik lokale of staging-fixtures.
3. Security-diff: WordPress-corechecksums, plugins, thema's, accounts/rollen/capabilities, configuratiebestanden, MU-plugins, geplande taken en onverwachte PHP-bestanden in uploads.
4. Functionele controles: homepage, login, permalinks, media, database, HTTPS en relevante formulieren waar veilig testbaar.
5. Bewijsketen: resultaten, beperkingen, logs en hashes vastleggen; onafhankelijke referenties waar mogelijk.

**Definition of Done:** een gespecificeerd dreigingsmodel, een reproduceerbare synthetische WordPress-fixture, positieve en negatieve herstelcases, een machineleesbaar resultaat met PASS/FAIL/INCONCLUSIVE, en expliciete scheiding tussen bestandsintegriteit, veiligheidsobservatie en functionele gezondheid. Geen productierestore en geen claim van volledige malwarevrijheid.

### Mission 029 | Evidence Provenance & Trust Model

**Doel:** expliciet maken welke actor, bron en tijdsreferentie een bewijsclaim ondersteunen.

Onderzoek: ondertekende manifests, sleutelbeheer, verificatie van externe referentiedigests, reproduceerbare builds en een overdrachtslog. Eerst een dreigingsmodel en interoperabiliteitsontwerp; geen automatische aanname dat een handtekening de waarneming waarheidsgetrouw maakt.

### Mission 030 | Continuous Validation & Change Detection

**Doel:** veilige, toestemminggebonden vergelijking tussen meetmomenten, met onderscheid tussen nieuwe waarnemingen, opgeloste bevindingen en onvoldoende bewijs.

Onderzoek: expliciete scope, limieten, planning, opslagretentie, reproduceerbare diff en bescherming tegen onbedoelde scanning of gevoelige dataverzameling. Geen actieve scanning zonder passende toestemming.

### Mission 031 | Reporting & Learning Experience

**Doel:** onderzoeksresultaten begrijpelijk maken voor ontwikkelaars, klanten en studenten.

Onderzoek: evidence-to-finding-links, uitleg van confidence en beperkingen, exportformaten, toegankelijkheid, voorbeeldlabs en lesmateriaal. Publicatie pas na review van privacy en feitelijke claims.

## 5. Kwaliteits- en releasebeleid

Voor elke volgende missie:

- Scope en dreigingsmodel vóór implementatie.
- Synthetische regressietests voor elke bevestigde kwetsbaarheid.
- `npm test`, relevante syntaxcontroles, `git diff --check` en dependency-audit.
- Geen onverwachte wijzigingen aan bronbewijs.
- Geen secrets of gevoelige artefacten in commits, tests of PR-beschrijvingen.
- Wijzigingen via featurebranch, pull request en CI; merge uitsluitend na expliciet maintainerbesluit.
- Release, package-publicatie en deployment zijn afzonderlijke besluiten.
- Compatibiliteitswijzigingen documenteren en waar nodig vooraf goedkeuren.

## 6. Directe onderhoudspunten

- [ ] Corrigeer de verouderde formulering over manifestcontroles in `docs/SCHEMA-MIGRATION.md` en controleer andere verwijzingen naar branch- of release-status.
- [ ] Controleer README- en SECURITY-tekst op historische vermeldingen van 'unreleased' na de merge van Mission 027. Een merge is nog geen npm-release.
- [ ] Leg voor Mission 028 eerst de labarchitectuur, testdata en niet-destructieve herstelprocedure vast.
- [ ] Beslis afzonderlijk of en wanneer een npm-release wordt gepubliceerd.
- [ ] Overweeg GitHub private vulnerability reporting in te schakelen en documenteer een veilig meldkanaal.

## 7. Eerstvolgende beslissing

**Voorgestelde volgende stap:** start Mission 028A als ontwerp- en validatiemissie. Nog geen herstel op een live website en nog geen automatische wijzigingen aan WordPress-productie. Het eerste concrete resultaat is een reviewbaar Recovery Validation Gate-ontwerp met testmatrix en acceptatiecriteria.

---

**Status van dit bestand:** projectnotities en roadmap. De Mission 027-resultaten zijn gebaseerd op de gerapporteerde lokale en GitHub-controles uit de projectconversatie. Toekomstige missies zijn voorstellen, geen reeds gerealiseerde functionaliteit.
