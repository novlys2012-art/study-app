-- Two students with saved progress, from before the answer log; the next migration moves it into reviews.
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.progress (user_id, subject_id, data, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'u1', '{"q1": {"n": 3, "c": 2, "l": 1}, "q2": {"n": 1, "c": 0, "l": 0}, "q3": {"n": 0, "c": 0}, "bad": "x"}', '2026-11-01T10:00:00Z'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'u1', '{"q1": {"n": 5, "c": 5, "l": 1}}', '2026-11-02T10:00:00Z');
