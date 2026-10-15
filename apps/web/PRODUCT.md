# LeakShield

LeakShield is a five-view AI privacy gateway console built with React, Vite, and Tailwind. Users can chat through the gateway, inspect what the model received, and open Incidents, Overview, Approvals, and Eval from the shared navigation.

The implemented chat workflow supports identity switching, a fresh conversation per identity, gateway verdicts, secret replacement, and inspection of request and response examples or completed exchanges. Approval requests are polled when connected to a non-mock backend. The UI distinguishes live, simulated, and mock connections; backend mode is operational information rather than a product guarantee.

The approved visual refinement is a warm beige, balanced entrance with restrained, smooth motion. The user requests no unnecessary lines, extras, or asymmetric layout. Its hero subject is the supplied robotic arm and butterfly image, stored at `public/art/robotic-hand-reference.png`. Preserve that supplied subject and the five-view working console. The butterfly lifts and returns smoothly while the robotic wrist moves subtly. Motion can be paused and respects reduced-motion preferences. Purple and yellow ambient illumination are excluded from the page and hero; semantic gateway verdict colors remain functional indicators.

This refinement applies to the entrance and shared warm neutral palette. Desktop hero columns are equal; mobile copy and the opening workspace are centered. The hero action and opening composer use rounded corners. Existing conversation, monitoring, inspection, and identity controls continue to serve their implemented workflows. DESIGN.md records the shipped visual system; it does not promise additional backend capabilities.

Sources: `README.md`, `src/App.tsx`, `src/components/ChatPanel.tsx`, `src/components/HandButterfly.tsx`, `src/components/Sidebar.tsx`, `src/lib/views.ts`, and `src/index.css`.
