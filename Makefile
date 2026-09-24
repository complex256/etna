# Etna, a parts-catalog viewer (Vue + Vite+). Builds one self-contained HTML file: dist/index.html.
#
#   make install    install dependencies (Vite+ picks the Node and pnpm versions)
#   make dev        dev server that opens $(DUMP) directly, with hot reload
#   make build      type-check and build dist/index.html
#   make open       build and open it from disk
#   make serve      build and serve it at http://localhost:$(PORT)/ (folder picker works there)
#   make check      format, lint and type checks
#   make test       checks + unit tests (the dump tests use $(DUMP))
#   make e2e        browser tests (the demo catalog, plus $(DUMP) when set)
#   make screenshots  README screenshots of the demo catalog, light and dark
#
# DUMP is the brand folder of a dump (the one containing Data1/Data2, Bilder, ...).

# Set it in the environment or on the command line: make dev DUMP=/path/to/dump/<brand>
DUMP ?=
PORT ?= 8765
# The Vite+ installer puts `vp` here; shells that do not load its env still find it.
# Its fallback-bin holds the pnpm version package.json pins; it must win over a system pnpm.
export PATH := $(HOME)/.local/share/vite-plus/bin:$(HOME)/.local/share/vite-plus/fallback-bin:$(PATH)
VP := $(shell PATH="$(PATH)" command -v vp)

.PHONY: all install dev build open serve check test unit e2e screenshots clean help

all: build

node_modules: package.json pnpm-workspace.yaml
	$(VP) install
	@touch node_modules

install: node_modules

dev: node_modules
	DUMP="$(DUMP)" $(VP) dev

build: node_modules
	$(VP) exec vue-tsc -b
	$(VP) build

open: build
	@command -v open >/dev/null && open dist/index.html || xdg-open dist/index.html

serve: build
	$(VP) preview --port $(PORT) --open

check: node_modules
	$(VP) check
	$(VP) exec vue-tsc -b

unit: node_modules
	DUMP="$(DUMP)" $(VP) test run

test: check unit

e2e: node_modules
	DUMP="$(DUMP)" $(VP) exec playwright test

screenshots: node_modules
	$(VP) node scripts/screenshots.ts

clean:
	rm -rf dist test-results playwright-report node_modules/.tmp

help:
	@sed -n '1,13p' Makefile | sed 's/^# \{0,1\}//'
