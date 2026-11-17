Mobile app
   ↓
Store user activity securely
   ↓
Collect consented fishing outcomes
   ↓
Combine them with licensed historical data
   ↓
Train and evaluate the custom model
   ↓
Generate hourly lake forecasts
   ↓
Send forecasts and alerts back to the app



### Step 2 — Current backend architecture

The backend is divided into three layers:

```text
Mobile app
    ↓
Supabase backend
    ↓
Python ML system
```

#### 1. Mobile-to-backend layer

The mobile app:

- Uses Supabase anonymous authentication.
- Writes catch logs to local SQLite first.
- Synchronizes those logs when internet is available.
- Reads generated forecasts from Supabase.
- Never contains service-role or model-training secrets.

#### 2. Supabase layer

Supabase provides:

- PostgreSQL database
- User authentication
- Row Level Security
- Forecast storage
- User-data synchronization
- Edge Functions for privileged operations

All BiteCast database objects live inside the `bitecast` schema.

#### 3. Python ML layer

The separate `ml/` application handles:

- Importing training data
- Validating and enriching observations
- Training CatBoost models
- Evaluating model quality
- Registering model versions
- Promoting champion models
- Generating future forecasts
- Writing forecast results back to Supabase

This layer uses backend-only credentials and does not run inside the mobile application.

The architecture is implemented in code, but the production environment is not complete yet. It still needs real licensed training data, a weather provider, trained champion models, secrets, and deployment verification.

Say **“next”** and I’ll walk through the first backend layer: authentication and user identity.