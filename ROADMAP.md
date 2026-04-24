# Scourge Bot Roadmap

This roadmap outlines the current state, completed systems, and future expansion plans for Scourge Bot.

--------------------------------------------------

CURRENT STATUS

Version: v2  
State: Production Ready (Single Server)  

✔ Fully modular architecture  
✔ Google Sheets database integration  
✔ Dynamic permission system  
✔ Command logging system  
✔ Admin role management system  

--------------------------------------------------

COMPLETED SYSTEMS

CORE SYSTEMS
- Verification system (/verify, /update, /profile)
- Personnel database integration

MODERATION
- Warning system (/warn)
- Punishment history tracking (/punishments)

RANK SYSTEM
- Promote / Demote / Set Rank
- Rank history logging
- Promotion/Demotion logs
- Role synchronization

EVENT SYSTEM
- Event creation / lifecycle (create, start, end)
- Attendance tracking
- Event reports
- Event leaderboard
- Host management

REPORT SYSTEM
- Case submission
- Assignment system
- Case resolution
- Report history

ADMIN SYSTEM
- Dynamic admin role system
- Custom permission levels
- Owner override controls

LOGGING SYSTEM
- Logs ALL commands
- Tracks:
  - user
  - role
  - command
  - options
  - result
  - timestamp

--------------------------------------------------

IN PROGRESS / NEXT UP

LOGGING EXPANSION
- Live Discord logging channel
- Log filtering (by command / user / type)
- Error-specific logging dashboard

PERMISSION SYSTEM V2
- Command-specific permission overrides
- Role hierarchy validation
- Auto-permission sync with Discord roles

SECURITY
- Anti-spam / command cooldown system
- Abuse detection (mass command usage)
- Lockdown mode (server-wide restriction)

--------------------------------------------------

PLANNED FEATURES (SHORT TERM)

ADMIN TOOLS
- /admin removrole (remove admin role)
- /admin resetpermissions
- /admin audit (view system usage)

EVENT SYSTEM UPGRADES
- RSVP system (join/leave instead of manual add)
- Auto attendance tracking
- Event reminders

REPORT SYSTEM UPGRADES
- Priority levels
- Auto assignment queue
- Escalation system

RANK SYSTEM UPGRADES
- Auto rank hierarchy enforcement
- Promotion cooldown tracking
- Rank requirement validation

--------------------------------------------------

PLANNED FEATURES (MID TERM)

ANALYTICS SYSTEM
- Most active users
- Most active staff
- Event participation stats
- Moderation activity tracking

DASHBOARD
- Web-based dashboard
- Live data sync with Google Sheets
- Admin control panel

DATABASE UPGRADE
- Move from Google Sheets → database (MongoDB / PostgreSQL)
- Faster queries
- Better scaling

MULTI-SERVER SUPPORT
- Per-guild configs
- Separate data per server
- Admin isolation per server

--------------------------------------------------

LONG TERM GOALS

ENTERPRISE SYSTEM
- Full backend API
- Scalable microservices
- Real-time data pipelines

AI INTEGRATION
- Auto moderation suggestions
- Report classification
- Smart event recommendations

AUTOMATION
- Auto promotions based on activity
- Auto punishments for violations
- Auto role syncing

--------------------------------------------------

VERSION ROADMAP

v2.1
- Logging upgrades
- Admin improvements
- Security layer

v2.5
- Analytics system
- Event upgrades
- Report system improvements

v3.0
- Database migration
- Dashboard release
- Multi-server support

v4.0
- AI + automation systems

--------------------------------------------------

NOTES

- Current system is optimized for structured communities
- Designed for scalability and modular expansion
- All systems can be upgraded independently

--------------------------------------------------
