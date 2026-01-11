# KanDu - AI-Powered Home Repair Assistant

## What This App Does
KanDu helps homeowners figure out if they can fix something themselves — and gets them help if they can't.

**Tagline:** "Before you panic, KanDu."

## User Flow
1. User has a problem (appliance, HVAC, plumbing, electrical, automotive)
2. They upload photos, video, or audio of the issue and describe it
3. AI analyzes everything — including sounds like rattles, squeaks, grinding, humming
4. Free diagnosis gives quick assessment: DIY-able? Need a pro?
5. Optional: User pays $1.99 for advanced diagnosis (detailed steps, parts list, safety warnings) - 30 seconds
6. If they need help: connect to live expert for video call (price TBD, ~$15-25 for 15 min)
7. If they need a pro: send video + diagnosis to local contractors for quotes (no site visit needed)

## Tech Stack
- Expo (React Native) - mobile + web from one codebase
- Supabase - database and auth (free tier)
- Gemini 2.0 Flash - free diagnosis (fast, cheap)
- Gemini 3 Pro - advanced diagnosis (detailed, powerful)
- Claude - conversation, expert matching, contractor communication
- Stripe - payments

## AI Services
- **Gemini 2.0 Flash** - free diagnosis (~$0.003/diagnosis). Quick assessment, basic "what's wrong", DIY or call a pro
- **Gemini 3 Pro** - advanced diagnosis for $1.99 (~$0.10 cost, 95% margin). Detailed breakdown, step-by-step repair guide, parts list with costs, safety warnings, confidence score
- **Claude** - powers conversation, expert matching, and contractor communication

## Diagnosis Tiers

### Free Diagnosis (Gemini 2.0 Flash, ~30 seconds)
- What's likely wrong
- DIY-able or need a pro?
- Urgency level (fix now vs. can wait)
- Basic safety warnings

### Advanced Diagnosis - $1.99 (Gemini 3 Pro, ~30 seconds)
- Detailed problem breakdown
- Step-by-step repair instructions
- Parts list with estimated costs
- Tools needed
- Detailed safety precautions
- Confidence score
- Alternative possibilities if main diagnosis doesn't fix it

## Media Upload
Users can upload:
- **Photos** - analyzed by Gemini vision
- **Video** - Gemini sees AND hears it (engine sounds, rattles, squeaks, water dripping, etc.)
- **Audio** - Gemini recognizes mechanical/environmental sounds, not just voice

Goal: User shows/tells us the problem however is easiest for them.

## Screens to Build
1. **HomeScreen** - pick category (Appliances, HVAC, Plumbing, Electrical, Automotive)
2. **DiagnosisScreen** - upload photo/video/audio, describe problem
3. **ResultsScreen** - show free diagnosis + option to upgrade to advanced ($1.99)
4. **AdvancedResultsScreen** - show detailed diagnosis after payment
5. **ExpertScreen** - book live expert video call
6. **ContractorScreen** - request quotes from local pros

## Design
- Clean, modern, mobile-first
- Primary color: blue (#2563eb)
- Simple and calming - users are stressed when something breaks
- Big clear buttons, easy media upload

## Categories
- 🔧 Appliances (washer, dryer, fridge, dishwasher, oven)
- ❄️ HVAC (heating, cooling, ventilation, thermostat)
- 🚰 Plumbing (pipes, drains, water heater, leaks, toilet)
- ⚡ Electrical (outlets, switches, wiring, breakers)
- 🚗 Automotive (engine, tires, brakes, battery, sounds)

## Key Differentiators
1. **Sound analysis** - user can record a rattle/squeak and AI identifies it
2. **Video-first diagnosis** - one video captures visual + audio evidence
3. **Tiered AI** - free quick assessment, $1.99 for detailed guide
4. **No site visit quotes** - contractors see the video, quote without coming out
5. **YouTube integration** (future) - help users while they watch repair videos

## Revenue Model
- **Free diagnosis:** Gemini 2.0 Flash (~$0.003 cost) - drives adoption
- **Advanced diagnosis:** $1.99 - Gemini 3 Pro (~$0.10 cost, 95% margin)
- **Expert sessions:** ~$15-25 per 15 min (we keep 30%, expert gets 70%)
- **Contractor leads:** ~$40-50 per qualified lead

## Projected Conversion Rates (per 1,000 users)
- 20% pay for advanced diagnosis → $400
- 15% book expert call → $3,000
- 10% request contractor quotes → $4,500
- **Total revenue per 1,000 users: ~$7,900**

## Current Status
Fresh Expo project, just getting started.

## MVP Priority
Phase 1: Home → Diagnosis → Results flow (photo upload + free Gemini Flash diagnosis)
Phase 2: Add advanced diagnosis with Stripe payment ($1.99)
Phase 3: Add video and audio upload
Phase 4: Expert booking (placeholder for now)
Phase 5: Contractor quotes (placeholder for now)
