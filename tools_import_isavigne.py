import csv, json, sys, time, urllib.request, urllib.parse
from datetime import datetime

BASE = sys.argv[1].rstrip("/")          # ex: https://ia-crm.aubach.fr/api
USER = sys.argv[2]
PWD  = sys.argv[3]
CLIENTS = sys.argv[4]
PRODUCTS = sys.argv[5]
SALES = sys.argv[6]
LIMIT = int(sys.argv[7]) if len(sys.argv) > 7 else 0  # 0 = full

def http(method, url, headers=None, data=None):
    req = urllib.request.Request(url, method=method)
    headers = headers or {}
    for k,v in headers.items():
        req.add_header(k, v)
    if data is not None:
        if isinstance(data, (dict, list)):
            data = json.dumps(data).encode("utf-8")
            req.add_header("Content-Type", "application/json")
        elif isinstance(data, str):
            data = data.encode("utf-8")
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type","")
            if "application/json" in ctype:
                return r.status, json.loads(body.decode("utf-8") or "null")
            return r.status, body.decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        return e.code, body
    except Exception as e:
        return 0, str(e)

def norm(s): return "".join(ch.lower() for ch in s if ch.isalnum() or ch in "_-").replace("-","_")

def pick(row, keys):
    # keys: list of candidate column names
    m = {norm(k): k for k in row.keys()}
    for k in keys:
        nk = norm(k)
        if nk in m:
            v = row[m[nk]]
            return v if v != "" else None
    return None

def to_float(x):
    if x is None: return None
    x = str(x).replace(",", ".")
    try: return float(x)
    except: return None

def to_iso_dt(x):
    if not x: return None
    s = str(x).strip()
    # si déjà iso-like, on garde
    if "T" in s and ":" in s: return s
    # tentatives simples
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).isoformat()
        except:
            pass
    return s

# Auth
token_status, token_body = http(
    "POST",
    f"{BASE}/auth/token",
    headers={"Content-Type":"application/x-www-form-urlencoded"},
    data=urllib.parse.urlencode({"username": USER, "password": PWD})
)
if token_status != 200:
    print("AUTH FAIL:", token_status, token_body)
    sys.exit(2)

access = token_body.get("access_token") if isinstance(token_body, dict) else None
if not access:
    print("AUTH FAIL: no access_token:", token_body)
    sys.exit(2)

H = {"Authorization": f"Bearer {access}"}

def post_or_put(entity, key, payload):
    # entity in ("clients","products")
    # try POST then fallback PUT /{key}
    st, body = http("POST", f"{BASE}/{entity}/", headers=H, data=payload)
    if st in (200, 201):
        return True
    # conflit/validation/duplicate -> tentative PUT
    st2, body2 = http("PUT", f"{BASE}/{entity}/{urllib.parse.quote(str(key))}", headers=H, data=payload)
    if st2 in (200, 201):
        return True
    # sinon log
    print(f"[{entity}] FAIL key={key} POST={st} PUT={st2} body={str(body)[:300]} / {str(body2)[:300]}")
    return False

def import_products(path):
    ok = 0; ko = 0
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for i,row in enumerate(r, start=1):
            if LIMIT and i > LIMIT: break
            product_key = pick(row, ["product_key","sku","code_produit","product","id_produit","produit_key"])
            name = pick(row, ["name","nom","libelle","designation","product_name"])
            price = to_float(pick(row, ["price","prix","unit_price","tarif","pv_ttc","pv_ht"]))
            payload = {"product_key": product_key, "name": name}
            if price is not None: payload["price"] = price
            if not product_key:
                ko += 1
                print("[products] SKIP: no product_key row", i)
                continue
            if post_or_put("products", product_key, payload):
                ok += 1
            else:
                ko += 1
    print(f"products import: ok={ok} ko={ko}")

def import_clients(path):
    ok = 0; ko = 0
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for i,row in enumerate(r, start=1):
            if LIMIT and i > LIMIT: break
            client_code = pick(row, ["client_code","code_client","customer_code","id_client","client"])
            name = pick(row, ["name","nom","raison_sociale","customer_name"])
            email = pick(row, ["email","mail","e_mail","email_address"])
            payload = {"client_code": client_code, "name": name, "email": email}
            if not client_code:
                ko += 1
                print("[clients] SKIP: no client_code row", i)
                continue
            if post_or_put("clients", client_code, payload):
                ok += 1
            else:
                ko += 1
    print(f"clients import: ok={ok} ko={ko}")

def import_sales(path):
    ok = 0; ko = 0
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for i,row in enumerate(r, start=1):
            if LIMIT and i > LIMIT: break
            payload = {
                "document_id": pick(row, ["document_id","doc_id","invoice","piece","num_piece","id_piece"]),
                "product_key": pick(row, ["product_key","sku","code_produit","produit","id_produit"]),
                "client_code": pick(row, ["client_code","code_client","customer_code","id_client"]),
                "quantity": to_float(pick(row, ["quantity","qty","quantite","qte"])),
                "amount": to_float(pick(row, ["amount","total","montant","ttc","total_ttc","ca"])),
                "sale_date": to_iso_dt(pick(row, ["sale_date","date","date_vente","sold_at","created_at"]))
            }
            if not payload["product_key"] or not payload["client_code"]:
                ko += 1
                print("[sales] SKIP missing product_key/client_code row", i)
                continue
            st, body = http("POST", f"{BASE}/sales/", headers=H, data=payload)
            if st in (200, 201):
                ok += 1
            else:
                ko += 1
                print(f"[sales] FAIL row={i} status={st} body={str(body)[:300]}")
    print(f"sales import: ok={ok} ko={ko}")

import_products(PRODUCTS)
import_clients(CLIENTS)
import_sales(SALES)

print("DONE")
