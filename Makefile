PORT ?= 8138

.PHONY: serve

# Serve the site at http://localhost:$(PORT). Ctrl-C to stop.
serve:
	@(sleep 1 && open http://localhost:$(PORT)) &
	python3 -m http.server $(PORT) --bind 127.0.0.1
