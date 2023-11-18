# dps-yank-history

[![license:MIT](https://img.shields.io/github/license/Milly/dps-yank-history?style=flat-square)](LICENSE)

Vim denops plugin for persist yank history.

## Required

- [denops.vim](https://github.com/vim-denops/denops.vim)

You will need one of the following to manipulate your history:

- [ddu.vim](https://github.com/Shougo/ddu.vim)
  - Display list of yank history.
  - Select and insert text from yank history.
  - Select and delete elements from yank history.
- [ddc.vim](https://github.com/Shougo/ddc.vim)
  - Insert matching text from yank history in insert mode.


## Configuration

```vim
" setup dps-yank-history
let yank_history#persist_path = expand('~') .. '/.cache/yank-history.jsonl'
let yank_history#min_length = 2
let yank_history#update_duration = 1000
let yank_history#mtime_margin = 200
let yank_history#max_items = 100
let yank_history#truncate_threshold = 0

" setup ddu.vim
call ddu#custom#patch_global('sources', [
      \   {'name': 'yank-history'},
      \ ])
call ddu#custom#patch_global('sourceParms', #{
      \ yank-history: #{
      \   headerHlGroup: 'Special',
      \   prefix: 'Hist:',
      \ }})

" setup ddc.vim
call ddc#custom#patch_global('sources', [
      \ 'yank-history',
      \])
call ddc#custom#patch_global('sourceParams', #{
      \ yank-history: #{
      \   maxAbbrWidth: 100,
      \   ctrlCharHlGroup: 'SpecialKey',
      \ }})
```
