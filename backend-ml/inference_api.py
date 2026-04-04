import random
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="MenuQR Inference Engine")

class RecommendRequest(BaseModel):
    items_in_cart: List[str] = []
    tenant_id: str = ""
    menu_item_ids: Optional[List[str]] = None

class RecommendResponse(BaseModel):
    recommended_items: List[str]

# For this MVP without a real model, we will mock the clustering/recommendation logic
# based on basic rules or hardcoded ids. A real app would load a model.
@app.on_event("startup")
async def load_model():
    print("Loading ML model...")
    # e.g., model = pickle.load(open("model.pkl", "rb"))
    pass

@app.post("/predict", response_model=RecommendResponse)
async def predict_recommendations(req: RecommendRequest):
    """Demo: elige hasta 3 ítems al azar del menú que no estén en el carrito."""
    cart = set(req.items_in_cart or [])
    candidates = [i for i in (req.menu_item_ids or []) if i and i not in cart]
    if not candidates:
        return RecommendResponse(recommended_items=[])
    k = min(3, len(candidates))
    recs = random.sample(candidates, k=k)
    return RecommendResponse(recommended_items=recs)

@app.get("/health")
async def health():
    return {"status": "ok"}
