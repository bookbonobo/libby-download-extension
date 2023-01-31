prod:
	npm run build
	(cd dist && web-ext build --overwrite-dest)