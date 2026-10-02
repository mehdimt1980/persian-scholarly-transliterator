# IJMES rule model

Rule data distinguishes five categories:

- **Chart**: character-level mappings from the supplied IJMES chart, including Persian consonants and long vowels.
- **Current guide**: current IJMES presentation policy, including title diacritic removal and preservation of ʿayn/hamza.
- **Linguistic convention**: knowledge needed to apply a documented policy, such as recognizing an izāfat context.
- **Lexical data**: a reading for a particular Persian word, with source and confidence.
- **Editorial**: display choices such as seeded compound readings.

The implementation defaults to current-guide policy for profile formatting while retaining the chart/current-guide provenance on each rule. The repository intentionally contains concise summaries rather than reproducing copyrighted source text. The chart is the primary source for character mappings; the current IJMES Translation and Transliteration Guide published by Cambridge University Press is the source for contextual presentation policy. Any discrepancy must be documented before expanding the rule set.

Important supported distinctions: Persian IJMES uses `i` and `u` rather than pronunciation-oriented `e` and `o`; long vowels are `ā ī ū`; izāfat is `-i`; ʿayn and hamza are distinct Unicode characters; output is Unicode.
