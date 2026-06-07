# TODO - Thread-safe DB write fix

- [ ] Update `web_app/app.py` to make DB writes thread-safe using a producer/consumer queue:
  - [x] Serial thread parses input and enqueues reading dicts.
  - [x] Dedicated DB worker thread consumes queue and commits using its own SQLAlchemy app context.
- [ ] Ensure `latest_reading` is updated safely and includes `timestamp`.
- [x] Start ML model loading before serial processing (avoid early None predictions).
- [ ] Run quick sanity checks:
  - [x] Python import check for `web_app/app.py`
  - [x] Start Flask app in a short/verified way (no long run) or at least `python -m py_compile`.


