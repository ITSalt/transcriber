.PHONY: dev-up dev-down

dev-up:
	docker compose up -d --wait

dev-down:
	docker compose down
