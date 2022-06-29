.PHONY: install
install:
	npm link

.PHONY: format
format:
	./node_modules/.bin/prettier --write cli.js

.PHONY: examples
examples: example1 example2 example3 example4

.PHONY: example1
example1:
	${MAKE} -C ./examples/01_HelloWorld/

.PHONY: example2
example2:
	${MAKE} -C ./examples/02_ParameterSubstitution/

.PHONY: example3
example3:
	${MAKE} -C ./examples/03_InnerSubstitution/

.PHONY: example4
example4:
	${MAKE} -C ./examples/04_Directories/
