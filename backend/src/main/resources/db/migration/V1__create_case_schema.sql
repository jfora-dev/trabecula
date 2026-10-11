-- Cases, their 3D data and their approval history.
-- Large binaries (STL models, CT voxels) are not stored here; rows carry a storage key.

create table surgical_case (
    id                 uuid primary key,
    version            bigint       not null,
    reference          varchar(32)  not null,
    title              varchar(200) not null,
    anatomy            varchar(32)  not null,
    side               varchar(8)   not null,
    patient_pseudonym  varchar(32)  not null,
    patient_birth_year integer      not null,
    surgeon_name       varchar(120) not null,
    clinic             varchar(120) not null,
    designer_name      varchar(120) not null,
    status             varchar(32)  not null,
    surgery_date       date         not null,
    plan_notes         text,
    created_at         timestamp with time zone not null,
    updated_at         timestamp with time zone not null,
    constraint surgical_case_reference_key unique (reference),
    constraint surgical_case_side_check check (side in ('LEFT', 'RIGHT')),
    constraint surgical_case_status_check check (status in ('IN_DESIGN', 'AWAITING_APPROVAL', 'APPROVED'))
);

create table case_model (
    id             uuid primary key,
    case_id        uuid         not null references surgical_case (id) on delete cascade,
    sort_order     integer      not null,
    name           varchar(120) not null,
    kind           varchar(32)  not null,
    stage          varchar(16)  not null,
    color          varchar(7)   not null,
    storage_key    varchar(200) not null,
    triangle_count integer      not null,
    size_bytes     bigint       not null,
    constraint case_model_kind_check check (kind in ('BONE', 'PLATE', 'SCREW', 'GUIDE', 'OSTEOTOMY_PLANE')),
    constraint case_model_stage_check check (stage in ('PREOP', 'PLANNED')),
    constraint case_model_color_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index case_model_case_idx on case_model (case_id, sort_order);

create table ct_volume (
    id                          uuid primary key,
    case_id                     uuid             not null references surgical_case (id) on delete cascade,
    storage_key                 varchar(200)     not null,
    description                 varchar(200)     not null,
    dim_x                       integer          not null check (dim_x > 0),
    dim_y                       integer          not null check (dim_y > 0),
    dim_z                       integer          not null check (dim_z > 0),
    spacing_x                   double precision not null check (spacing_x > 0),
    spacing_y                   double precision not null check (spacing_y > 0),
    spacing_z                   double precision not null check (spacing_z > 0),
    origin_x                    double precision not null,
    origin_y                    double precision not null,
    origin_z                    double precision not null,
    rescale_slope               double precision not null,
    rescale_intercept           double precision not null,
    suggested_bone_threshold_hu integer          not null,
    constraint ct_volume_case_key unique (case_id)
);

create table case_status_event (
    id           uuid primary key,
    case_id      uuid         not null references surgical_case (id) on delete cascade,
    from_status  varchar(32),
    to_status    varchar(32)  not null,
    action       varchar(32)  not null,
    actor        varchar(120) not null,
    comment_text text,
    occurred_at  timestamp with time zone not null,
    constraint case_status_event_action_check
        check (action in ('CREATE', 'SUBMIT_FOR_APPROVAL', 'APPROVE', 'REQUEST_CHANGES'))
);

create index case_status_event_case_idx on case_status_event (case_id, occurred_at);
