# dps-yank-history

[![license:MIT](https://img.shields.io/github/license/Milly/dps-yank-history?style=flat-square)](LICENSE)

Vim denops plugin for persist yank history.

## Required

- [denops.vim](https://github.com/vim-denops/denops.vim)
- [ddu.vim](https://github.com/Shougo/ddu.vim)

## Configuration

```vim
let yank_history#persist_path = expand('~') .. '/.cache/yank-history.jsonl'
let yank_history#max_items = 200
call ddu#custom#patch_global('sources', [
      \   {'name': 'yank-history'},
      \ ])
call ddu#custom#patch_global('sourceParms', {
      \ 'yank-history': #{
      \   prefix: 'Hist:',
      \ }})
```
