/**
 * Wording for findings, in English and Dutch.
 *
 * A message entry has a check name, and per outcome an observed sentence and
 * optionally an explanation and a recommended action. Rules decide the
 * outcome; this file decides how it reads.
 */

const list = (names, max = 6) => {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} (+${names.length - max})` : shown;
};

export const MESSAGES = {
  en: {
    'transport.https': {
      check: 'The page is served over HTTPS',
      outcomes: {
        https: { observed: () => 'The final document was served over HTTPS.' },
        insecure: {
          observed: (d) => `The final document was served over ${d.scheme}.`,
          explanation: () => 'Traffic that is not encrypted can be read and changed by anything between the visitor and the server.',
          action: () => 'Serve the site over HTTPS and redirect all plain http traffic to https.'
        }
      }
    },
    'transport.mixedContent': {
      check: 'No insecure subresources on a secure page',
      outcomes: {
        notApplicable: { observed: () => 'Not applicable: the page itself is not served over HTTPS.' },
        clean: { observed: () => 'No plain http subresources were observed.' },
        mixed: {
          observed: (d) => `${d.count} request(s) over plain http on an HTTPS page.`,
          explanation: () => 'Mixed content undermines the encryption of the page and is blocked or downgraded by modern browsers.',
          action: () => 'Load every subresource over HTTPS, or remove the resource.'
        }
      }
    },
    'headers.main': {
      check: 'Security headers on the main document',
      outcomes: {
        noDocument: { observed: () => 'No main document response was observed, so headers could not be checked.' },
        complete: { observed: () => 'All checked security headers were present.' },
        missing: {
          observed: (d) => `${d.count} security header(s) missing: ${list(d.names, 8)}.`,
          explanation: () => 'These headers instruct the browser what it may load, whether the page may be framed, and how much of the URL is passed on to third parties.',
          action: () => 'Add the missing headers at the web server, CDN or application layer, and verify that the site still functions.'
        }
      }
    },
    'thirdParty.domains': {
      check: 'Third-party domains contacted during the page load',
      outcomes: {
        none: { observed: () => 'No third-party domains were contacted.' },
        present: {
          observed: (d) => `${d.count} third-party domain(s) contacted: ${list(d.names)}.`,
          explanation: () => 'Every third party that the browser contacts receives at least the visitor IP address, the user agent and often the referring page.',
          action: () => 'Confirm that each third party is necessary, has a processing basis, and appears in the privacy statement and processor register.'
        }
      }
    },
    'thirdParty.scripts': {
      check: 'Third-party scripts executing on the page',
      outcomes: {
        none: { observed: () => 'No third-party scripts were observed.' },
        present: {
          observed: (d) => `${d.count} third-party script(s) from ${d.domainCount} domain(s): ${list(d.names)}.`,
          explanation: () => 'A third-party script runs with the same rights as the site itself. If that supplier is compromised, the visitor is compromised.',
          action: () => 'Reduce the number of external scripts, and consider subresource integrity or self-hosting.'
        }
      }
    },
    'privacy.trackers': {
      check: 'Trackers observed on load',
      outcomes: {
        none: {
          observed: () => 'No tracker from the bundled rule set was observed during this page load.',
          explanation: () => 'The rule set is limited. Absence of a match is not evidence that no tracking occurs.'
        },
        loaded: {
          observed: (d) => `${d.count} tracker(s) loaded: ${list(d.names)}. No data transmission was observed.`,
          explanation: () => 'The tracker scripts were loaded before any consent interaction was performed by the test browser. No request that looks like a data transmission was observed within the observation window.',
          action: () => 'Check whether these trackers may load before consent under the GDPR and the Dutch Telecommunications Act, and move them behind the consent banner if not.'
        },
        transmitting: {
          observed: (d) =>
            `${d.count} tracker(s) observed: ${list(d.names)}. ${d.transmissions} data transmission(s) to ${list(
              d.transmittingNames
            )}, of which ${d.accepted} accepted by the receiver.`,
          explanation: () =>
            'This is not only a script that was loaded. Data was actively sent to the third party before any consent interaction was performed by the test browser. An accepted transmission is a 2xx response from the receiver.',
          action: () =>
            'Move these trackers behind the consent banner or remove them, then rescan to confirm that no transmission occurs before consent.'
        }
      }
    },
    'privacy.trackingCookies': {
      check: 'Tracking cookies set during the visit',
      outcomes: {
        none: { observed: () => 'No cookie matching the tracker rule set was observed.' },
        present: {
          observed: (d) => `${d.count} tracking cookie(s): ${list(d.names)}.`,
          explanation: () => 'These cookies were set before any consent interaction was performed by the test browser.',
          action: () => 'Place tracking cookies behind consent and document them in the cookie statement.'
        }
      }
    },
    'cookies.attributes': {
      check: 'Cookie attributes',
      outcomes: {
        none: { observed: () => 'No cookies were observed.' },
        clean: { observed: (d) => `${d.count} cookie(s), no weak attributes observed.` },
        weak: {
          observed: (d) => {
            const parts = [];
            if (d.weak) parts.push(`${d.weak} cookie(s) without the Secure attribute on an HTTPS site`);
            if (d.longLived) parts.push(`${d.longLived} cookie(s) with a lifetime longer than one year`);
            return `${parts.join(' and ')}.`;
          },
          explanation: () => 'A cookie without Secure can be sent over an unencrypted connection. A long lifetime extends how long a visitor stays recognisable.',
          action: () => 'Set Secure and an appropriate SameSite on every cookie, and shorten lifetimes that are longer than the purpose requires.'
        }
      }
    },
    'storage.sensitiveKeys': {
      check: 'Sensitive looking keys in browser storage',
      outcomes: {
        none: { observed: (d) => `${d.total} storage key(s), none with a sensitive looking name.` },
        present: {
          observed: (d) => `${d.count} storage key(s) with a sensitive looking name: ${list(d.names)}.`,
          explanation: () => 'The key name suggests a token or personal data. The value was deliberately not read, so this is an indication and not proof. Data in localStorage is readable by any script on the page and survives the session.',
          action: () => 'Verify manually what is stored under these keys. Keep session tokens in an HttpOnly cookie rather than in browser storage.'
        }
      }
    },
    'redirects.chain': {
      check: 'Redirect chain of the main document',
      outcomes: {
        none: { observed: () => 'No redirects were observed.' },
        internal: { observed: (d) => `${d.hops} redirect hop(s) within the first-party domain.` },
        long: {
          observed: (d) => `${d.hops} redirect hop(s) within the first-party domain.`,
          explanation: () => 'A long redirect chain slows down the first page view and complicates caching.',
          action: () => 'Reduce the chain to one redirect where possible.'
        },
        external: {
          observed: (d) => `${d.hops} redirect hop(s), of which at least one leaves the first-party domain.`,
          explanation: () => 'A redirect through an external domain exposes the visit to that party and can be used for tracking.',
          action: () => 'Verify that the external hop is intended and necessary.'
        }
      }
    },
    'quality.consoleErrors': {
      check: 'Console errors during the page load',
      outcomes: {
        none: {
          observed: (d) => (d && d.browserOriginExcluded
            ? `No console errors attributable to the site were observed. ${d.browserOriginExcluded} browser/runtime-origin message(s) (e.g. WebGL or GPU driver noise) were observed separately and are not counted as a site defect.`
            : 'No console errors were observed.')
        },
        onlyBrowserOrigin: {
          observed: (d) => `No console errors attributable to the site were observed. ${d.browserOriginExcluded} browser/runtime-origin message(s) (e.g. WebGL or GPU driver noise) were observed separately and are not counted as a site defect.`
        },
        present: {
          observed: (d) => `${d.count} console error(s) attributable to the page or a third-party script during a normal page load${d.browserOriginExcluded ? ` (${d.browserOriginExcluded} additional browser/runtime-origin message(s) observed separately, not counted here)` : ''}.`,
          explanation: () => 'Console errors indicate broken functionality, missing files or failing integrations. They are a quality signal, not a vulnerability by themselves. Browser/runtime-origin noise (WebGL, GPU, driver warnings) is classified separately and excluded from this count because it is not attributable to the site.',
          action: () => 'Resolve the errors, starting with failing requests and missing resources.'
        }
      }
    },
    'quality.failedRequests': {
      check: 'Requests that failed to load',
      outcomes: {
        none: { observed: () => 'No failed requests were observed.' },
        present: {
          observed: (d) => `${d.count} request(s) failed to load.`,
          explanation: () => 'Failed requests point to removed files, blocked third parties or configuration errors.',
          action: () => 'Check each failing request and remove or repair the reference.'
        }
      }
    }
  },

  nl: {
    'transport.https': {
      check: 'De pagina wordt via HTTPS aangeboden',
      outcomes: {
        https: { observed: () => 'Het uiteindelijke document is via HTTPS geleverd.' },
        insecure: {
          observed: (d) => `Het uiteindelijke document is via ${d.scheme} geleverd.`,
          explanation: () => 'Verkeer dat niet versleuteld is, kan worden meegelezen en aangepast door alles tussen de bezoeker en de server.',
          action: () => 'Lever de site via HTTPS en stuur al het http-verkeer door naar https.'
        }
      }
    },
    'transport.mixedContent': {
      check: 'Geen onveilige onderdelen op een beveiligde pagina',
      outcomes: {
        notApplicable: { observed: () => 'Niet van toepassing: de pagina zelf wordt niet via HTTPS aangeboden.' },
        clean: { observed: () => 'Er zijn geen onderdelen via gewoon http waargenomen.' },
        mixed: {
          observed: (d) => `${d.count} verzoek(en) via gewoon http op een HTTPS-pagina.`,
          explanation: () => 'Gemengde inhoud ondermijnt de versleuteling van de pagina en wordt door moderne browsers geblokkeerd of afgezwakt.',
          action: () => 'Laad elk onderdeel via HTTPS, of verwijder het.'
        }
      }
    },
    'headers.main': {
      check: 'Beveiligingsheaders op het hoofddocument',
      outcomes: {
        noDocument: { observed: () => 'Er is geen hoofddocument waargenomen, dus de headers konden niet worden gecontroleerd.' },
        complete: { observed: () => 'Alle gecontroleerde beveiligingsheaders waren aanwezig.' },
        missing: {
          observed: (d) => `${d.count} beveiligingsheader(s) ontbreken: ${list(d.names, 8)}.`,
          explanation: () => 'Deze headers vertellen de browser wat er geladen mag worden, of de pagina in een frame mag staan, en hoeveel van de URL wordt doorgegeven aan derden.',
          action: () => 'Voeg de ontbrekende headers toe op de webserver, CDN of applicatielaag en controleer daarna of de site blijft werken.'
        }
      }
    },
    'thirdParty.domains': {
      check: 'Externe domeinen die tijdens het laden zijn benaderd',
      outcomes: {
        none: { observed: () => 'Er zijn geen externe domeinen benaderd.' },
        present: {
          observed: (d) => `${d.count} extern(e) domein(en) benaderd: ${list(d.names)}.`,
          explanation: () => 'Elke externe partij die de browser benadert, ontvangt minimaal het IP-adres van de bezoeker, de browsergegevens en vaak de pagina waar het bezoek vandaan komt.',
          action: () => 'Ga na of elke externe partij nodig is, een verwerkingsgrondslag heeft, en in de privacyverklaring en het verwerkersregister staat.'
        }
      }
    },
    'thirdParty.scripts': {
      check: 'Externe scripts die op de pagina worden uitgevoerd',
      outcomes: {
        none: { observed: () => 'Er zijn geen externe scripts waargenomen.' },
        present: {
          observed: (d) => `${d.count} extern(e) script(s) van ${d.domainCount} domein(en): ${list(d.names)}.`,
          explanation: () => 'Een extern script draait met dezelfde rechten als de site zelf. Als die leverancier gecompromitteerd raakt, raakt de bezoeker dat ook.',
          action: () => 'Beperk het aantal externe scripts en overweeg subresource integrity of zelf hosten.'
        }
      }
    },
    'privacy.trackers': {
      check: 'Trackers waargenomen bij het laden',
      outcomes: {
        none: {
          observed: () => 'Tijdens dit bezoek is geen tracker uit de meegeleverde regelset waargenomen.',
          explanation: () => 'De regelset is beperkt. Het uitblijven van een match is geen bewijs dat er niet gevolgd wordt.'
        },
        loaded: {
          observed: (d) => `${d.count} tracker(s) geladen: ${list(d.names)}. Er is geen dataverzending waargenomen.`,
          explanation: () => 'De trackerscripts zijn geladen voordat de testbrowser enige toestemmingshandeling heeft verricht. Binnen het waarneemvenster is geen verzoek gezien dat op dataverzending lijkt.',
          action: () => 'Ga na of deze trackers volgens de AVG en de Telecommunicatiewet vóór toestemming mogen laden, en zet ze anders achter de toestemmingsbanner.'
        },
        transmitting: {
          observed: (d) =>
            `${d.count} tracker(s) waargenomen: ${list(d.names)}. ${d.transmissions} dataverzending(en) naar ${list(
              d.transmittingNames
            )}, waarvan ${d.accepted} door de ontvanger aangenomen.`,
          explanation: () =>
            'Dit is niet alleen een script dat geladen is. Er is actief data naar de externe partij gestuurd voordat de testbrowser enige toestemmingshandeling had verricht. Aangenomen betekent dat de ontvanger met een 2xx-status antwoordde.',
          action: () =>
            'Zet deze trackers achter de toestemmingsbanner of verwijder ze, en scan daarna opnieuw om te bevestigen dat er vóór toestemming niets meer wordt verstuurd.'
        }
      }
    },
    'privacy.trackingCookies': {
      check: 'Trackingcookies die tijdens het bezoek zijn geplaatst',
      outcomes: {
        none: { observed: () => 'Er is geen cookie waargenomen die overeenkomt met de regelset.' },
        present: {
          observed: (d) => `${d.count} trackingcookie(s): ${list(d.names)}.`,
          explanation: () => 'Deze cookies zijn geplaatst voordat de testbrowser enige toestemmingshandeling had verricht.',
          action: () => 'Plaats trackingcookies achter toestemming en beschrijf ze in de cookieverklaring.'
        }
      }
    },
    'cookies.attributes': {
      check: 'Cookie-instellingen',
      outcomes: {
        none: { observed: () => 'Er zijn geen cookies waargenomen.' },
        clean: { observed: (d) => `${d.count} cookie(s), geen zwakke instellingen waargenomen.` },
        weak: {
          observed: (d) => {
            const parts = [];
            if (d.weak) parts.push(`${d.weak} cookie(s) zonder de Secure-instelling op een HTTPS-site`);
            if (d.longLived) parts.push(`${d.longLived} cookie(s) met een looptijd langer dan een jaar`);
            return `${parts.join(' en ')}.`;
          },
          explanation: () => 'Een cookie zonder Secure kan over een onversleutelde verbinding worden verstuurd. Een lange looptijd verlengt hoelang een bezoeker herkenbaar blijft.',
          action: () => 'Zet Secure en een passende SameSite op elke cookie en verkort looptijden die langer zijn dan het doel vraagt.'
        }
      }
    },
    'storage.sensitiveKeys': {
      check: 'Gevoelig ogende sleutels in de browseropslag',
      outcomes: {
        none: { observed: (d) => `${d.total} opgeslagen sleutel(s), geen daarvan met een gevoelig ogende naam.` },
        present: {
          observed: (d) => `${d.count} opgeslagen sleutel(s) met een gevoelig ogende naam: ${list(d.names)}.`,
          explanation: () => 'De naam van de sleutel wijst op een token of persoonsgegevens. De waarde is bewust niet uitgelezen, dus dit is een aanwijzing en geen bewijs. Gegevens in localStorage zijn leesbaar voor elk script op de pagina en blijven na de sessie staan.',
          action: () => 'Controleer handmatig wat er onder deze sleutels staat. Bewaar sessietokens in een HttpOnly-cookie en niet in de browseropslag.'
        }
      }
    },
    'redirects.chain': {
      check: 'Doorverwijzingen van het hoofddocument',
      outcomes: {
        none: { observed: () => 'Er zijn geen doorverwijzingen waargenomen.' },
        internal: { observed: (d) => `${d.hops} doorverwijzing(en) binnen het eigen domein.` },
        long: {
          observed: (d) => `${d.hops} doorverwijzing(en) binnen het eigen domein.`,
          explanation: () => 'Een lange keten van doorverwijzingen vertraagt de eerste paginaweergave en bemoeilijkt caching.',
          action: () => 'Breng de keten waar mogelijk terug tot één doorverwijzing.'
        },
        external: {
          observed: (d) => `${d.hops} doorverwijzing(en), waarvan minstens één buiten het eigen domein.`,
          explanation: () => 'Een doorverwijzing via een extern domein maakt het bezoek zichtbaar voor die partij en kan voor tracking worden gebruikt.',
          action: () => 'Controleer of de externe stap bedoeld en noodzakelijk is.'
        }
      }
    },
    'quality.consoleErrors': {
      check: 'Fouten in de console tijdens het laden',
      outcomes: {
        none: {
          observed: (d) => (d && d.browserOriginExcluded
            ? `Er zijn geen aan de website toe te schrijven consolefouten waargenomen. ${d.browserOriginExcluded} bericht(en) met browser/runtime-herkomst (bijvoorbeeld WebGL- of GPU-drivermeldingen) zijn apart waargenomen en tellen niet mee als sitefout.`
            : 'Er zijn geen consolefouten waargenomen.')
        },
        onlyBrowserOrigin: {
          observed: (d) => `Er zijn geen aan de website toe te schrijven consolefouten waargenomen. ${d.browserOriginExcluded} bericht(en) met browser/runtime-herkomst (bijvoorbeeld WebGL- of GPU-drivermeldingen) zijn apart waargenomen en tellen niet mee als sitefout.`
        },
        present: {
          observed: (d) => `${d.count} consolefout(en) toe te schrijven aan de pagina of een externe script tijdens een gewone paginaweergave${d.browserOriginExcluded ? ` (${d.browserOriginExcluded} extra bericht(en) met browser/runtime-herkomst apart waargenomen, hier niet meegeteld)` : ''}.`,
          explanation: () => 'Consolefouten wijzen op kapotte functionaliteit, ontbrekende bestanden of falende koppelingen. Het is een kwaliteitssignaal en op zichzelf geen kwetsbaarheid. Ruis met browser/runtime-herkomst (WebGL, GPU, drivermeldingen) wordt apart geclassificeerd en telt niet mee, omdat dit niet aan de website is toe te schrijven.',
          action: () => 'Los de fouten op, te beginnen bij mislukte verzoeken en ontbrekende bestanden.'
        }
      }
    },
    'quality.failedRequests': {
      check: 'Verzoeken die niet konden worden geladen',
      outcomes: {
        none: { observed: () => 'Er zijn geen mislukte verzoeken waargenomen.' },
        present: {
          observed: (d) => `${d.count} verzoek(en) konden niet worden geladen.`,
          explanation: () => 'Mislukte verzoeken wijzen op verwijderde bestanden, geblokkeerde externe partijen of configuratiefouten.',
          action: () => 'Controleer elk mislukt verzoek en verwijder of herstel de verwijzing.'
        }
      }
    }
  }
};

export function renderMessage(messageId, outcome, data, lang = 'en') {
  const catalog = MESSAGES[lang] || MESSAGES.en;
  const entry = catalog[messageId] || MESSAGES.en[messageId];
  if (!entry) return { check: messageId, observed: outcome, explanation: null, action: null };
  const outcomeEntry = entry.outcomes[outcome] || {};
  return {
    check: entry.check,
    observed: outcomeEntry.observed ? outcomeEntry.observed(data || {}) : outcome,
    explanation: outcomeEntry.explanation ? outcomeEntry.explanation(data || {}) : null,
    action: outcomeEntry.action ? outcomeEntry.action(data || {}) : null
  };
}

export const SUPPORTED_LANGUAGES = Object.keys(MESSAGES);

export const LIMITATIONS = {
  en: {
    singlePage: 'Single page load of one URL. Pages behind navigation, login or interaction were not observed.',
    singleViewport: 'One viewport and one user agent. Responsive or device-specific behaviour may differ.',
    noConsent: 'No consent interaction was performed. Nothing was accepted or refused in a consent banner, so trackers that load only after consent may be absent from this evidence.',
    ruleSet: 'Tracker detection is limited to the bundled rule set. Absence of a match is not evidence that no tracking occurs.',
    headersMainOnly: 'Security headers are observed on the main document response only.',
    noBodies: 'No request or response bodies were inspected, by design.',
    consoleOrigin: 'Console messages and page errors are classified as application, third-party, browser or unclassified origin using a documented, non-exhaustive signature list for known browser/GPU/driver runtime noise. Browser-origin messages remain in this evidence document but carry no weight in the console-quality finding, because they are not attributable to the site.'
  },
  nl: {
    singlePage: 'Eén paginaweergave van één URL. Pagina’s achter navigatie, inloggen of interactie zijn niet waargenomen.',
    singleViewport: 'Eén schermformaat en één browserprofiel. Op andere apparaten kan het gedrag afwijken.',
    noConsent: 'Er is geen toestemmingshandeling verricht. Er is niets geaccepteerd of geweigerd in een toestemmingsbanner, dus trackers die pas na toestemming laden kunnen hier ontbreken.',
    ruleSet: 'Trackerherkenning is beperkt tot de meegeleverde regelset. Het uitblijven van een match is geen bewijs dat er niet gevolgd wordt.',
    headersMainOnly: 'Beveiligingsheaders zijn alleen op het hoofddocument waargenomen.',
    noBodies: 'De inhoud van verzoeken en antwoorden is bewust niet onderzocht.',
    consoleOrigin: 'Consoleberichten en pagina-fouten worden geclassificeerd als applicatie-, externe-partij-, browser- of ongeclassificeerde herkomst, met een gedocumenteerde, niet-uitputtende signatuurlijst voor bekende browser/GPU/drivergerelateerde ruis. Berichten met browserherkomst blijven in dit bewijsdocument staan, maar tellen niet mee in de consolebevinding, omdat ze niet aan de website zijn toe te schrijven.'
  }
};

export function renderLimitations(limitations = [], lang = 'en') {
  const catalog = LIMITATIONS[lang] || LIMITATIONS.en;
  return limitations.map((l) => (typeof l === 'string' ? l : catalog[l.id] || l.text));
}
