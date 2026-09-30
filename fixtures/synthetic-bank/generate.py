"""Generate synthetic KBC-style bank customers and their seeded BOB brains.

Usage: python3 fixtures/synthetic-bank/generate.py
Writes customers/<customer_id>/
  profile.json       bank metadata (what the bank knows)
  transactions.csv   12 months of transactions
  brain/*.md         personality, situation, experience (seeded from ground truth, not Librarian output)
  reference.json     look-alikes only: situation at cutoff + observed outcome, for the pattern matcher

Deterministic: same seed -> same output. All data is synthetic. Money is integer euro cents.
"""

import csv
import json
import random
import shutil
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).parent / "customers"
START, END = date(2025, 10, 1), date(2026, 9, 30)
D = date.fromisoformat
NUM = {1: "one", 2: "two", 3: "three"}


def months():
    d = START
    while d <= END:
        yield d
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def on(day, frm=START, to=END):
    return [m.replace(day=day) for m in months() if frm <= m.replace(day=day) <= to]


def eur(cents):
    return f"€{cents / 100:,.2f}"


# --- Personas ---------------------------------------------------------------

EMMA = {
    "customer_id": "cust_emma", "seed": 34,
    "story": "Demo protagonist. Renting, two kids, new better-paid job; daycare since 2026-03 pushes savings under her own 5,000 EUR buffer goal.",
    "personal": {"first_name": "Emma", "last_name": "Claes", "birth_date": "1992-04-17", "place_of_birth": "Mechelen",
                 "address": {"street": "Tiensestraat 88 bus 3", "postal_code": "3000", "city": "Leuven", "country": "BE"},
                 "civil_status": "legally_cohabiting", "language": "nl", "customer_since": "2014-09-01"},
    "jobs": [{"employer": "Brightwave Logistics NV", "title": "Logistics planner", "net": 285000, "start": None},
             {"employer": "Nordlicht Software BV", "title": "Product analyst", "net": 336300, "start": "2026-08-01"}],
    "partner": {"name": "J. Wouters", "contribution": 30000},
    "kids": [{"birth_year": 2020, "after_school": 9450}, {"birth_year": 2025, "daycare": 61240, "daycare_from": "2026-03-01"}],
    "rent": 124500, "landlord": "M. Peeters", "car_loan": 28650, "spend": 1.0, "holiday": 61200,
    "opening": {"current": 310000, "savings": 560000}, "cushion": 450000,
    "positions": [{"product": "Synthetic Global Equity Fund", "type": "fund", "units": 42.5, "value_cents": 510000}],
    "interactions": [
        {"date": "2024-03-12", "channel": "branch", "topic": "car_loan", "trait": "prefers_advisor_for_big_decisions",
         "note": "Took car loan after face-to-face advisor meeting; said she prefers discussing big decisions in person."},
        {"date": "2025-11-18", "channel": "phone", "topic": "savings", "trait": "likes_planning",
         "goal": ("Keep at least €5,000 on savings as a safety buffer", 500000),
         "note": "Wants to always keep at least 5,000 EUR on savings as a safety buffer. Plans the family budget monthly in a spreadsheet."},
        {"date": "2026-08-04", "channel": "app", "topic": "kyc_update", "note": "Updated employer to Nordlicht Software BV."},
    ],
    "events": [],
}

JONAS = {
    "customer_id": "cust_jonas", "seed": 36,
    "story": "Same life stage as Emma (renting, two kids, rising income) but prefers self-service: gets an app budget simulator, not an advisor call.",
    "personal": {"first_name": "Jonas", "last_name": "Maes", "birth_date": "1990-02-03", "place_of_birth": "Lier",
                 "address": {"street": "Bruul 41", "postal_code": "2800", "city": "Mechelen", "country": "BE"},
                 "civil_status": "married", "language": "nl", "customer_since": "2011-05-20"},
    "jobs": [{"employer": "Scheldt Engineering NV", "title": "Project engineer", "net": 312000, "start": None},
             {"employer": "Scheldt Engineering NV", "title": "Senior project engineer", "net": 358800, "start": "2026-06-01"}],
    "partner": {"name": "L. Verhoeven", "contribution": 55000},
    "kids": [{"birth_year": 2019, "after_school": 8800}, {"birth_year": 2022, "after_school": 8800}],
    "rent": 118000, "landlord": "Immo Dijlevallei BV", "car_loan": None, "spend": 1.05, "holiday": 84000,
    "opening": {"current": 290000, "savings": 1150000}, "cushion": 450000, "positions": [],
    "interactions": [
        {"date": "2025-12-02", "channel": "app", "topic": "budget_tool", "trait": "prefers_self_service",
         "note": "Set up spending categories in the app; declined advisor callback, prefers arranging things digitally."},
    ],
    "events": [],
}

FIRST = ["Lotte", "Sarah", "Julie", "Elien", "Hanne", "Laura", "Charlotte", "Nina", "Sofie", "Katrien", "Ine",
         "Tom", "Pieter", "Wouter", "Bram", "Stijn", "Thomas", "Jens", "Ruben", "Dries", "Maarten", "Joris"]
LAST = ["Peeters", "Janssens", "Jacobs", "Mertens", "Willems", "Goossens", "De Smet", "Dubois", "Hermans", "Aerts",
        "Michiels", "Lambrechts", "Vermeulen", "Van den Broeck", "Coppens", "Martens", "Smets", "De Wit", "Wouters",
        "Verbeke", "Hendrickx", "Stevens"]
CITIES = [("3000", "Leuven"), ("2800", "Mechelen"), ("9000", "Gent"), ("2000", "Antwerpen"), ("3500", "Hasselt"),
          ("8000", "Brugge"), ("9300", "Aalst"), ("2500", "Lier"), ("3001", "Heverlee"), ("8500", "Kortrijk")]
STREETS = ["Stationsstraat", "Kerkstraat", "Molenstraat", "Nieuwstraat", "Schoolstraat", "Dorpsstraat"]
EMPLOYERS = [("Flanders Care vzw", "Nurse"), ("Deltaport Logistics NV", "Planner"), ("Brabant Retail NV", "Store manager"),
             ("Kempen Tech BV", "Developer"), ("City of Mechelen", "Policy officer"), ("Noordzee Foods NV", "Quality lead"),
             ("Leie Consulting BV", "Consultant"), ("Scholengroep Rivierenland", "Teacher")]
TRAIT_NOTES = {
    "prefers_advisor_for_big_decisions": ("branch", "Discussed a large purchase with an advisor in person; prefers face-to-face for big decisions."),
    "prefers_self_service": ("app", "Uses budget tools in the app; declined advisor callback, prefers to arrange things digitally."),
    "likes_planning": ("phone", "Asked for a yearly cost overview; plans family expenses ahead."),
}
# 22 earlier customers in Emma's life stage; 14 bought a bigger home within 6 months (video: "14 of 22").
OUTCOMES = ["home_purchase"] * 14 + ["renovation"] * 5 + ["none"] * 3


def lookalike(i, outcome):
    rng = random.Random(1000 + i)
    first, last = FIRST[i], LAST[i]
    postal, city = rng.choice(CITIES)
    raise_at = date(2025, rng.randint(11, 12), 1) if rng.random() < 0.4 else date(2026, rng.randint(1, 3), 1)
    old_emp, new_emp = rng.sample(EMPLOYERS, 2)
    net = rng.randrange(260000, 340000, 500)
    young = rng.randint(2022, 2025)
    kids = [{"birth_year": rng.randint(2016, 2020), "after_school": rng.randrange(7000, 11000, 50)}, {"birth_year": young}]
    if young == 2025:
        kids[1] |= {"daycare": rng.randrange(45000, 68000, 20), "daycare_from": f"2026-{rng.randint(1, 9):02d}-01"}
    channel_trait = rng.choice(["prefers_advisor_for_big_decisions"] * 3 + ["prefers_self_service"] * 2)
    self_service = channel_trait == "prefers_self_service"
    traits = [channel_trait] + (["likes_planning"] if rng.random() < 0.5 else [])
    interactions = []
    for n, t in enumerate(traits):
        ch, note = TRAIT_NOTES[t]
        interactions.append({"date": f"2025-{3 + n * 4:02d}-{rng.randint(3, 27):02d}", "channel": ch, "topic": "contact", "trait": t, "note": note})
    events = []
    if outcome == "home_purchase":
        p = min(raise_at + timedelta(days=rng.randint(75, 175)), END - timedelta(days=20))
        price = rng.randrange(28500000, 39500000, 50000)
        events.append({"type": "home_purchase", "date": p.isoformat(), "price": price, "mortgage": round(price * 0.0042)})
        interactions.append({"date": (p - timedelta(days=rng.randint(55, 70))).isoformat(), "channel": "app" if self_service else "branch",
                             "topic": "mortgage", "note": "Ran a mortgage simulation in the app for a bigger home." if self_service
                             else "Mortgage information meeting; looking for a bigger home for the family."})
    elif outcome == "renovation":
        r = min(raise_at + timedelta(days=rng.randint(60, 200)), END - timedelta(days=15))
        events.append({"type": "renovation", "date": r.isoformat(), "amount": rng.randrange(900000, 2200000, 5000)})
        interactions.append({"date": (r - timedelta(days=30)).isoformat(), "channel": "app" if self_service else "phone",
                             "topic": "renovation", "note": "Asked about a renovation loan to convert the attic into a bedroom."})
    interactions.sort(key=lambda x: x["date"])
    initial = lambda: f"{rng.choice('ABDEFGHKLMNPRSTV')}. {rng.choice(LAST)}"
    return {
        "customer_id": f"cust_{first.lower()}{i + 1:02d}", "seed": 2000 + i,
        "story": f"Emma look-alike: renting, two kids, income up from {raise_at:%Y-%m}. Outcome: {outcome}.",
        "personal": {"first_name": first, "last_name": last,
                     "birth_date": f"{rng.randint(1986, 1995)}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                     "place_of_birth": rng.choice(CITIES)[1],
                     "address": {"street": f"{rng.choice(STREETS)} {rng.randint(2, 180)}", "postal_code": postal, "city": city, "country": "BE"},
                     "civil_status": rng.choice(["married", "legally_cohabiting", "cohabiting"]), "language": "nl",
                     "customer_since": f"{rng.randint(2005, 2018)}-{rng.randint(1, 12):02d}-01"},
        "jobs": [{"employer": old_emp[0], "title": old_emp[1], "net": net, "start": None},
                 {"employer": new_emp[0], "title": new_emp[1], "net": round(net * rng.uniform(1.10, 1.25), -2), "start": raise_at.isoformat()}],
        "partner": {"name": initial(), "contribution": rng.randrange(25000, 60000, 5000)},
        "kids": kids, "rent": rng.randrange(95000, 140000, 500), "landlord": initial(),
        "car_loan": rng.choice([None, rng.randrange(20000, 35000, 50)]), "spend": rng.uniform(0.85, 1.1),
        "holiday": rng.randrange(40000, 110000, 100),
        "opening": {"current": rng.randrange(300000, 450000, 1000), "savings": rng.randrange(600000, 1600000, 1000)},
        "cushion": 450000, "positions": [], "interactions": interactions, "events": events,
        "reference": {"cutoff": (raise_at + timedelta(days=31)).isoformat(),
                      "situation_tags_at_cutoff": ["renting", "family_two_children", "new_job", "income_rising"],
                      "personality_tags": traits, "outcome": outcome,
                      "outcome_date": events[0]["date"] if events else None, "outcome_window_days": 183},
    }


PERSONAS = [EMMA, JONAS] + [lookalike(i, o) for i, o in enumerate(OUTCOMES)]


# --- Transactions -----------------------------------------------------------

def build(p):
    rng = random.Random(p["seed"])
    short = p["customer_id"][5:]
    cur, sav = f"acc_{short}_current", f"acc_{short}_savings"
    me = f'{p["personal"]["first_name"]} {p["personal"]["last_name"]}'
    tx = []

    def add(acc, d, cents, cp, desc, cat):
        tx.append({"account_id": acc, "booking_date": d.isoformat(), "amount_cents": round(cents),
                   "currency": "EUR", "counterparty": cp, "description": desc, "category": cat})

    purchase = next((e for e in p["events"] if e["type"] == "home_purchase"), None)
    moved = D(purchase["date"]) if purchase else None

    for d in on(28):
        job = [j for j in p["jobs"] if j["start"] is None or D(j["start"]) <= d][-1]
        add(cur, d, job["net"], job["employer"], f"Loon {d:%Y-%m}", "income_salary")
    for d in on(2):
        add(cur, d, p["partner"]["contribution"], p["partner"]["name"], "Bijdrage huishouden", "income_transfer_household")
    n = len(p["kids"])
    for d in on(10):
        add(cur, d, 20618 * n + 1, "FONS", f"Groeipakket {d:%m/%Y} kind {'+'.join(str(k + 1) for k in range(n))}", "income_child_benefit")

    for d in on(1, to=moved or END):
        add(cur, d, -p["rent"], p["landlord"], "Huur", "housing_rent")
    if purchase:
        price = purchase["price"]
        add(sav, moved - timedelta(days=75), price * 0.10, "Ouders", "Schenking", "income_gift")
        add(sav, moved - timedelta(days=60), -price * 0.05, "Notaris Vandamme", "Voorschot compromis", "housing_purchase")
        add(sav, moved, -price * 0.04, "Notaris Vandamme", "Registratie- en aktekosten", "housing_purchase")
        for d in on(5, frm=moved + timedelta(days=1)):
            add(cur, d, -purchase["mortgage"], "Synthetic Bank", "Aflossing woonkrediet", "housing_mortgage")
        add(sav, moved + timedelta(days=3), -rng.randrange(60000, 120000), "Verhuisfirma Snel", "Verhuis", "housing_moving")
        add(sav, moved + timedelta(days=9), -rng.randrange(80000, 160000), "IKEA Zaventem", "Betaling Bancontact", "shopping_furniture")
    for e in p["events"]:
        if e["type"] == "renovation":
            r = D(e["date"])
            add(sav, r, -e["amount"] * 0.6, "Aannemer Bouwwerken Dirk", "Voorschot zolderrenovatie", "housing_renovation")
            add(cur, r + timedelta(days=6), -e["amount"] * 0.05, "Gamma", "Bouwmaterialen", "housing_renovation")

    for k, kid in enumerate(p["kids"], 1):
        if kid.get("daycare"):
            for d in on(5, frm=D(kid["daycare_from"])):
                add(cur, d, -kid["daycare"], "Kinderdagverblijf De Speelboom", f"Opvang kind {k} {d:%m/%Y}", "childcare")
        if kid.get("after_school"):
            for d in on(14):
                add(cur, d, -kid["after_school"], "IBO De Knikker", f"Naschoolse opvang kind {k} {d:%m/%Y}", "childcare")
        if 2026 - kid["birth_year"] >= 3:
            add(cur, date(2026, 9, 2 + k), -rng.randrange(6000, 15000), "Basisschool Sint-Jozef", f"Schoolrekening kind {k}", "education")
        if 2026 - kid["birth_year"] >= 5:
            for d in on(4):
                add(cur, d, -rng.choice([4500, 6400, 7500]), "Sportclub", f"Lidgeld kind {k}", "kids_activities")

    for d in on(12):
        add(cur, d, -rng.choice([15500, 16800, 17900]), "Engie", "Voorschot energie", "utilities_energy")
    for d in on(15):
        add(cur, d, -7499, "Proximus", "Internet + mobiel", "utilities_telecom")
    for d in on(20):
        if d.month in (12, 3, 6, 9):
            add(cur, d, -6120, "De Watergroep", "Water voorschot", "utilities_water")
    for d in on(6):
        add(cur, d, -1399, "Netflix", "Netflix abonnement", "subscription_streaming")
    for d in on(8):
        add(cur, d, -9210, "Synthetic Verzekeringen", "Familiale + auto verzekering", "insurance")
    if p["car_loan"]:
        for d in on(3):
            add(cur, d, -p["car_loan"], "Synthetic Auto Finance", "Aflossing autolening", "loan_repayment")
    add(cur, date(2026, 7, 11), -p["holiday"], "Synthetic Vakantieparken", "Vakantie", "travel")

    s = p["spend"]
    d = START + timedelta(days=(5 - START.weekday()) % 7)  # Saturdays
    while d <= END:
        add(cur, d, -rng.uniform(11500, 17500) * s, rng.choice(["Colruyt", "Delhaize", "Aldi"]), "Betaling Bancontact", "groceries")
        if rng.random() < 0.35:
            add(cur, d + timedelta(days=1), -rng.uniform(1800, 5500) * s, rng.choice(["Pizzeria Da Mario", "Frituur 't Pleintje", "Bakkerij Moens"]), "Betaling Bancontact", "eating_out")
        if rng.random() < 0.5:
            add(cur, d - timedelta(days=2), -rng.uniform(4500, 7000), rng.choice(["TotalEnergies", "Q8"]), "Brandstof", "transport_fuel")
        if rng.random() < 0.8:
            add(cur, d - timedelta(days=3), -rng.uniform(1200, 4500) * s, rng.choice(["Kruidvat", "Action", "HEMA"]), "Betaling Bancontact", "shopping_household")
        if rng.random() < 0.6:
            add(cur, d - timedelta(days=1), -rng.uniform(2500, 8000) * s, rng.choice(["Bol.com", "Zalando", "Coolblue"]), "Online aankoop", "shopping_online")
        d += timedelta(days=7)
    for d in on(18):
        add(cur, d, -rng.uniform(6000, 14000) * s, rng.choice(["JBC", "Zeeman", "H&M"]), "Betaling Bancontact", "shopping_clothing")
    tx = [t for t in tx if START <= D(t["booking_date"]) <= END]

    # ponytail: sweep on the 28th after salary (excess above cushion to savings, shortfall pulled back) instead of hand-tuned transfers.
    # O(months * tx); fine at 100 customers.
    for day in on(28):
        c = p["opening"]["current"] + sum(t["amount_cents"] for t in tx if t["account_id"] == cur and D(t["booking_date"]) <= day)
        delta = (c - p["cushion"]) // 5000 * 5000
        if delta >= 5000 or c < p["cushion"] - 50000:
            add(cur, day, -delta, me, "Naar spaarrekening" if delta > 0 else "Van spaarrekening", "transfer_internal")
            add(sav, day, delta, me, "Van zichtrekening" if delta > 0 else "Naar zichtrekening", "transfer_internal")

    tx.sort(key=lambda t: (t["booking_date"], t["account_id"], -t["amount_cents"]))
    bal = dict(p["opening"])
    kind = {cur: "current", sav: "savings"}
    history = {"current": [], "savings": []}
    for i, t in enumerate(tx, 1):
        t["transaction_id"] = f"{p['customer_id']}_tx{i:05d}"
        a = kind[t["account_id"]]
        bal[a] += t["amount_cents"]
        history[a].append((t["booking_date"], bal[a]))
        assert bal[a] >= 0, f"{p['customer_id']} {a} overdrawn on {t['booking_date']}"
    tag = short[:4].upper()
    accounts = [{"account_id": cur, "type": "current", "iban": f"BE00 SYNT {tag} 0001", "balance_cents": bal["current"]},
                {"account_id": sav, "type": "savings", "iban": f"BE00 SYNT {tag} 0002", "balance_cents": bal["savings"]}]
    return tx, accounts, history


# --- Seeded brains ----------------------------------------------------------

HEADER = f"> Synthetic fixture brain, seeded from generator ground truth as of {END}. Not Librarian output.\n\n"


def render_brain(p, tx, accounts, history):
    cid = p["customer_id"]
    name = f'{p["personal"]["first_name"]} {p["personal"]["last_name"]}'
    ints = [dict(it, id=f"{cid}_int{n}") for n, it in enumerate(p["interactions"], 1)]
    old, new = p["jobs"][-2], p["jobs"][-1]

    def first(cat, since=""):
        return next(t["transaction_id"] for t in tx if t["category"] == cat and t["booking_date"] >= since)

    def last(cat):
        return next(t["transaction_id"] for t in reversed(tx) if t["category"] == cat)

    def line(text, status, *ev):
        return f"- {text} _{status}_ [{', '.join(ev)}]\n"

    # Situation
    tags, facts = [], []
    purchase = next((e for e in p["events"] if e["type"] == "home_purchase"), None)
    if purchase:
        tags += ["homeowner", "recently_moved"]
        facts.append(line(f"Bought a home on {purchase['date']}; mortgage repayment {eur(purchase['mortgage'])}/month.",
                          "observed", first("housing_purchase"), first("housing_mortgage")))
    else:
        tags.append("renting")
        facts.append(line(f"Rents; {eur(p['rent'])}/month to {p['landlord']}.", "observed", last("housing_rent")))
    n = len(p["kids"])
    tags.append(f"family_{NUM[n]}_children")
    facts.append(line(f"{n} children receive Groeipakket child benefit.", "observed", last("income_child_benefit")))
    for kid in p["kids"]:
        if kid.get("daycare"):
            tags.append("childcare_costs")
            facts.append(line(f"Daycare since {kid['daycare_from']}, {eur(kid['daycare'])}/month.", "observed", first("childcare", kid["daycare_from"])))
    if new["start"] and new["net"] > old["net"]:
        tags += (["new_job"] if new["employer"] != old["employer"] else []) + ["income_rising"]
        pct = round((new["net"] / old["net"] - 1) * 100)
        facts.append(line(f"Net salary up {pct}% since {new['start']} ({new['employer']}, {eur(new['net'])}/month).",
                          "observed", first("income_salary", new["start"])))
    facts.append(line(f"Partner contributes {eur(p['partner']['contribution'])}/month to household costs.", "observed", last("income_transfer_household")))
    facts.append(line(f"Lives in {p['personal']['address']['city']}; civil status {p['personal']['civil_status'].replace('_', ' ')}.", "bank_record", "profile"))
    sav = accounts[1]
    facts.append(line(f"Savings balance {eur(sav['balance_cents'])}.", "observed", sav["account_id"]))
    goal = next((it for it in ints if it.get("goal")), None)
    if goal and sav["balance_cents"] < goal["goal"][1]:
        h, g = history["savings"], goal["goal"][1]
        since = [d for (_, prev), (d, b) in zip(h, h[1:]) if prev >= g > b][-1]  # most recent drop below goal
        tags.append("savings_below_goal")
        facts.append(line(f"Savings under own {eur(goal['goal'][1])} buffer goal since {since}.", "observed", sav["account_id"], goal["id"]))
    for e in p["events"]:
        if e["type"] == "renovation":
            tags.append("renovating")
            facts.append(line(f"Renovation started {e['date']} (attic).", "observed", first("housing_renovation")))
    situation = (f"# Situation: {name}\n\n{HEADER}## Tags\n\n" + " · ".join(f"`{t}`" for t in tags) + "\n\n## Facts\n\n" + "".join(facts)
                 + "\n## Open hypotheses\n\n_None recorded. Proactor proposes; Librarian records only observed or customer-confirmed facts._\n")

    # Personality
    traits = [it for it in ints if it.get("trait")]
    names = {t["trait"] for t in traits}
    pref = ("advisor, in person" if "prefers_advisor_for_big_decisions" in names
            else "app, self-service" if "prefers_self_service" in names else "unknown")
    personality = (f"# Personality: {name}\n\n{HEADER}## Tags\n\n" + " · ".join(f"`{t['trait']}`" for t in traits) + "\n\n## Observations\n\n"
                   + "".join(line(t["note"], "customer_stated", t["id"]) for t in traits)
                   + f"\n## Communication\n\n- Preferred channel for big decisions: {pref}.\n- Language: {p['personal']['language']}.\n")

    # Experience
    timeline = [(new["start"], f"Started as {new['title']} at {new['employer']} (was {old['title']} at {old['employer']}).")] if new["start"] else []
    timeline += [(k["daycare_from"], "Youngest child started daycare.") for k in p["kids"] if k.get("daycare_from")]
    timeline += [(e["date"], "Bought a home and moved." if e["type"] == "home_purchase" else "Started attic renovation.") for e in p["events"]]
    experience = (f"# Experience: {name}\n\n{HEADER}## Goals\n\n" + (line(goal["goal"][0], "customer_stated", goal["id"]) if goal else "_None stated._\n")
                  + "\n## Life events\n\n" + "".join(f"- {d}: {t}\n" for d, t in sorted(timeline))
                  + "\n## Interactions\n\n" + "".join(f"- {it['date']} ({it['channel']}): {it['note']} [{it['id']}]\n" for it in ints))
    return {"situation.md": situation, "personality.md": personality, "experience.md": experience}


# --- Output -----------------------------------------------------------------

def write(p):
    tx, accounts, history = build(p)
    cid = p["customer_id"]
    d = OUT / cid
    (d / "brain").mkdir(parents=True)
    old, new = p["jobs"][-2], p["jobs"][-1]
    profile = {
        "synthetic": True, "customer_id": cid, "personal": p["personal"],
        "employment": {"status": "employed", "employer": new["employer"], "job_title": new["title"], "since": new["start"],
                       "previous": {"employer": old["employer"], "job_title": old["title"]}},
        "consent": {"personalised_insights": True, "marketing": False},
        "accounts": [dict(a, balance_as_of=END.isoformat()) for a in accounts],
        "positions": [dict(x, as_of=END.isoformat()) for x in p["positions"]],
        "interactions": [{"interaction_id": f"{cid}_int{n}", **{k: it[k] for k in ("date", "channel", "topic", "note")}}
                         for n, it in enumerate(p["interactions"], 1)],
        "history": {"from": START.isoformat(), "to": END.isoformat()},
    }
    (d / "profile.json").write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n")
    with open(d / "transactions.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["transaction_id", "account_id", "booking_date", "amount_cents", "currency", "counterparty", "description", "category"])
        w.writeheader()
        w.writerows(tx)
    for name, md in render_brain(p, tx, accounts, history).items():
        (d / "brain" / name).write_text(md)
    if "reference" in p:
        (d / "reference.json").write_text(json.dumps({"synthetic": True, "customer_id": cid, "story": p["story"], **p["reference"]}, indent=2) + "\n")
    return tx, accounts


if __name__ == "__main__":
    shutil.rmtree(OUT, ignore_errors=True)
    results = {p["customer_id"]: write(p) for p in PERSONAS}

    # Story checks: fail loudly if the demo narrative stops being true.
    emma_sav = results["cust_emma"][1][1]["balance_cents"]
    assert emma_sav < 500000, f"Emma savings {eur(emma_sav)} not under her 5,000 EUR goal"
    refs = [p["reference"] for p in PERSONAS if "reference" in p]
    hits = [r for r in refs if r["outcome"] == "home_purchase"
            and 0 <= (D(r["outcome_date"]) - D(r["cutoff"])).days <= r["outcome_window_days"]]
    assert (len(hits), len(refs)) == (14, 22), (len(hits), len(refs))
    print(f"{len(PERSONAS)} customers, {sum(len(t) for t, _ in results.values())} transactions; "
          f"Emma savings {eur(emma_sav)}; {len(hits)}/{len(refs)} look-alikes bought a home within 6 months of cutoff")
