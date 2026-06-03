-- ── Row Level Security — portal-role data isolation

alter table patients           enable row level security;
alter table patient_insurance  enable row level security;
alter table patient_conditions enable row level security;
alter table patient_medications enable row level security;
alter table claims             enable row level security;
alter table prior_auths        enable row level security;
alter table denial_events      enable row level security;
alter table care_events        enable row level security;
alter table notifications      enable row level security;
alter table audit_logs         enable row level security;

-- Hospital admins see all records in their org
create policy hospital_admin_patients on patients
    for all using (org_id = (select org_id from users where auth_id = auth.uid()));

create policy hospital_admin_claims on claims
    for all using (org_id = (select org_id from users where auth_id = auth.uid()));

-- Patients see only their own records
create policy patient_own_conditions on patient_conditions
    for select using (
        patient_id in (
            select id from patients
            where user_id = (select id from users where auth_id = auth.uid())
        )
    );

create policy patient_own_care_events on care_events
    for select using (
        patient_id in (
            select id from patients
            where user_id = (select id from users where auth_id = auth.uid())
        )
        and 'patient' = any(portal_visibility)
    );

create policy patient_own_notifications on notifications
    for all using (user_id = (select id from users where auth_id = auth.uid()));
