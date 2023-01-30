prod:
	npx webpack --config webpack.prod.js
	(cd dist && web-ext build --overwrite-dest)