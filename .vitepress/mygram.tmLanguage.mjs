/**
 * TextMate grammar for the MygramDB query / wire-protocol language.
 *
 * Authored for Shiki's "custom language" API (https://shiki.style/guide/load-lang).
 * Every pattern maps to a STANDARD TextMate scope name so that the bundled
 * github-light / github-dark themes color it correctly with no extra CSS.
 *
 * Canonical language id: `mygram` (alias: `mygramql`).
 *
 * @type {import('vitepress').MarkdownOptions['languages'] extends (infer T)[] ? T : never}
 */
const grammar = {
  name: 'mygram',
  scopeName: 'source.mygram',
  aliases: ['mygramql'],
  patterns: [
    { include: '#comments' },
    { include: '#response' },
    { include: '#keywords' },
    { include: '#logical' },
    { include: '#comparison-word' },
    { include: '#directions' },
    { include: '#booleans' },
    { include: '#placeholders' },
    { include: '#comparison-symbol' },
    { include: '#strings' },
    { include: '#numbers' },
    { include: '#special-fields' },
    { include: '#brackets' },
    { include: '#parens' }
  ],
  repository: {
    // SQL-style (`-- ...`) and shell-style (`# ...`) line comments.
    comments: {
      patterns: [
        {
          name: 'comment.line.double-dash.mygram',
          match: '--.*$'
        },
        {
          name: 'comment.line.number-sign.mygram',
          match: '(^|\\s)#.*$'
        }
      ]
    },

    // Response-line leading tokens. All map to one distinct class.
    //   OK RESULTS 3 101 ...   OK COUNT 42   ERROR Invalid query   +OK   -ERR ...
    response: {
      patterns: [
        {
          // Redis-style simple-string / error prefixes.
          name: 'support.function.response.mygram',
          match: '^\\s*[+-](?:OK|ERR|PONG)\\b'
        },
        {
          // Line-start status word, plus an optional response sub-keyword.
          match:
            '^\\s*(OK|ERROR)\\b(?:[ \\t]+(RESULTS|COUNT|FACET|HIGHLIGHT|GET|INFO|STATUS|PONG|SYNC|OPTIMIZE))?',
          captures: {
            1: { name: 'support.function.response.mygram' },
            2: { name: 'support.function.response.mygram' }
          }
        }
      ]
    },

    // Command / clause keywords.
    keywords: {
      name: 'keyword.control.mygram',
      match:
        '\\b(SEARCH|COUNT|GET|SYNC|DUMP|SAVE|LOAD|STATUS|INFO|REPLICATION|STOP|START|OPTIMIZE|CONFIG|HELP|VERIFY|SHOW|PING|FACET|HIGHLIGHT|FUZZY|FILTER|SORT|LIMIT|OFFSET)\\b'
    },

    // Boolean operators.
    logical: {
      name: 'keyword.operator.logical.mygram',
      match: '\\b(AND|OR|NOT)\\b'
    },

    // Word-form comparison operators.
    'comparison-word': {
      name: 'keyword.operator.comparison.mygram',
      match: '\\b(EQ|NE|GT|GTE|LT|LTE)\\b'
    },

    // Sort directions.
    directions: {
      name: 'keyword.other.mygram',
      match: '\\b(ASC|DESC)\\b'
    },

    // Literal booleans / null (common in CONFIG SHOW output).
    booleans: {
      name: 'constant.language.mygram',
      match: '\\b(true|false|null)\\b'
    },

    // Angle-bracket placeholders: <table>, <term>, <query_expression>, <id1> ...
    placeholders: {
      name: 'variable.parameter.mygram',
      match: '<[A-Za-z_][A-Za-z0-9_]*>'
    },

    // Symbolic comparison operators (longest first).
    'comparison-symbol': {
      name: 'keyword.operator.comparison.mygram',
      match: '(!=|<>|>=|<=|=|>|<)'
    },

    // Double-quoted string literals.
    strings: {
      name: 'string.quoted.double.mygram',
      begin: '"',
      beginCaptures: {
        0: { name: 'punctuation.definition.string.begin.mygram' }
      },
      end: '"',
      endCaptures: {
        0: { name: 'punctuation.definition.string.end.mygram' }
      },
      patterns: [
        { name: 'constant.character.escape.mygram', match: '\\\\.' }
      ]
    },

    // Numeric literals.
    numbers: {
      name: 'constant.numeric.mygram',
      match: '\\b\\d+(?:\\.\\d+)?\\b'
    },

    // Special virtual fields such as _score, _id.
    'special-fields': {
      name: 'variable.language.mygram',
      match: '\\b_[A-Za-z][A-Za-z0-9_]*\\b'
    },

    // Optional-group brackets — punctuation, never an error.
    brackets: {
      name: 'punctuation.section.brackets.mygram',
      match: '[\\[\\]]'
    },

    // Grouping parentheses for boolean precedence.
    parens: {
      name: 'punctuation.section.parens.mygram',
      match: '[()]'
    }
  }
}

export default grammar
