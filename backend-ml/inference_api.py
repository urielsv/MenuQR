from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import os

app = FastAPI(title="MenuQR Inference Engine")

class RecommendRequest(BaseModel):
    items_in_cart: List[str]
    tenant_id: str

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
    # Mock logic: Return different items depending on what's in the cart
    # Normally this would be something like: model.predict(req.items_in_cart)
    # Let's say we have logic that always recommends complimentary items
    
    recs = []
    # Hardcoded fake logic to simulate AI
    if len(req.items_in_cart) > 0:
        # Just return some dummy UUIDs representing items, or string keys
        # The backend should ideally map these back to Database Items
        recs = [
            "a3bb189e-8bf9-3888-9912-ace4e6543003", # e.g. Papas
            "a3bb189e-8bf9-3888-9912-ace4e6543004"  # e.g. Soda
        ]
    else:
        # If cart is empty, recommend the top sellers
        recs = [
            "a3bb189e-8bf9-3888-9912-ace4e6543001"
        ]
        
    return RecommendResponse(recommended_items=recs)

@app.get("/health")
async def health():
    return {"status": "ok"}
